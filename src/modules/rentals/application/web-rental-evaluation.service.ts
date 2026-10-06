import { Inject, Injectable } from '@nestjs/common';
import {
  RENTAL_AVAILABILITY_READER,
  type RentalAvailabilityReader,
} from '../domain/ports/rental-availability.port';
import {
  RENTAL_POLICY_PROVIDER,
  type RentalPolicyProvider,
} from '@modules/settings/public/rental-policy';
import { calculateRentalDurationDays } from '../domain/rental-policy';
import {
  assertOnlineRentalDuration,
  resolveRentalCyclePricing,
  sumRentalPricingAmounts,
} from '../domain/rental-cycle-pricing';
import {
  rentalBillableQuantity,
  resolveRentalLinePricing,
} from '../domain/rental-pricing-snapshot';
import type {
  WebAvailabilityQueryInput,
  WebAvailabilityResult,
  WebRentalQuoteInput,
  WebRentalQuoteResult,
} from './web-rental.contracts';
import { evaluateWebRentalSelection, resolveWebRentalSelection } from './web-rental-selection';
import {
  parseWebRentalDateRangeInput,
  assertWebRentalItemsInput,
  throwForInvalidWebRentalSelection,
} from './web-rental-input';

@Injectable()
export class WebRentalEvaluationService {
  constructor(
    @Inject(RENTAL_AVAILABILITY_READER) private readonly availability: RentalAvailabilityReader,
    @Inject(RENTAL_POLICY_PROVIDER) private readonly policyProvider: RentalPolicyProvider,
  ) {}

  async checkAvailability(
    shopId: string,
    query: WebAvailabilityQueryInput,
  ): Promise<WebAvailabilityResult> {
    const { from, until } = parseWebRentalDateRangeInput(query);
    assertWebRentalItemsInput([
      { productId: query.productId, variantId: query.variantId, quantity: 1 },
    ]);

    const durationDays = calculateRentalDurationDays(from, until);
    const policy = await this.policyProvider.getPolicy(shopId);
    assertOnlineRentalDuration(durationDays, policy.rentalPricing);

    const selection = await resolveWebRentalSelection(this.availability, {
      shopId,
      items: [{ productId: query.productId, variantId: query.variantId, quantity: 1 }],
      durationDays,
      from,
      until,
    });
    if (!selection.valid) {
      throwForInvalidWebRentalSelection(selection.reason);
      return { available: false, availableQuantity: 0 };
    }

    const demand = selection.demands[0];
    if (!demand) return { available: false, availableQuantity: 0 };
    const availableQuantity = demand.variant.availableInventory.length;
    return { available: availableQuantity > 0, availableQuantity };
  }

  async calculateQuote(shopId: string, req: WebRentalQuoteInput): Promise<WebRentalQuoteResult> {
    const { from, until } = parseWebRentalDateRangeInput(req);
    assertWebRentalItemsInput(req.items);

    const policy = await this.policyProvider.getPolicy(shopId);
    const durationDays = calculateRentalDurationDays(from, until);
    assertOnlineRentalDuration(durationDays, policy.rentalPricing);
    const billableQuantity = rentalBillableQuantity(req.items);
    const pricing = resolveRentalCyclePricing({
      durationDays,
      billableQuantity,
      policy: policy.rentalPricing,
    });
    const selection = await evaluateWebRentalSelection(this.availability, {
      shopId,
      items: req.items,
      durationDays,
      from,
      until,
    });
    if (selection.failure) {
      throwForInvalidWebRentalSelection(selection.failure);
    }
    const rentalAmounts: number[] = [];
    const depositAmounts: number[] = [];
    let allAvailable = selection.failure === undefined;

    if (selection.failure === undefined) {
      for (const { variant, quantity } of selection.demands) {
        if (variant.availableInventory.length < quantity) allAvailable = false;
        const line = resolveRentalLinePricing({
          durationDays,
          billableQuantity,
          policy: policy.rentalPricing,
          quantity,
          depositPerItem: variant.depositPerItem,
        });
        rentalAmounts.push(line.lineTotal);
        depositAmounts.push(line.depositAmount);
        const result = selection.items.find((item) => item.variantId === variant.id);
        if (result) {
          result.unitRentalPrice = line.unitRentalPrice;
          result.lineTotal = line.lineTotal;
          result.depositAmount = line.depositAmount;
        }
      }
    }

    const standardShippingFee = policy.delivery.standardShippingFee;
    const shippingFee = req.deliveryMethod === 'shop_delivery' ? standardShippingFee : 0;
    const rentalSubtotal = sumRentalPricingAmounts(rentalAmounts);
    const depositAmount = sumRentalPricingAmounts(depositAmounts);
    const totalAmount = sumRentalPricingAmounts([rentalSubtotal, shippingFee]);

    return {
      durationDays,
      pricing,
      rentalSubtotal,
      depositAmount,
      shippingFee,
      totalAmount,
      currency: 'VND',
      available: allAvailable,
      canCheckout: allAvailable,
      items: selection.items,
    };
  }
}

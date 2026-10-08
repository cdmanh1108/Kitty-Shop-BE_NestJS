import { Inject, Injectable, Optional } from '@nestjs/common';
import { CustomerLoyaltyService } from '@modules/customers/public/customer-loyalty';
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
import { evaluateWebRentalSelection } from './web-rental-selection';
import {
  InvalidRentalItemSelectionError,
  RentalAuthenticationRequiredError,
} from './rental.errors';
import { RentalLoyaltyRewardUnavailableError } from '../domain/rental-errors';
import { rentalAccessoryAllowance, rentalSelectionKey } from '../domain/rental-accessories';
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
    @Optional() private readonly customerLoyalty?: CustomerLoyaltyService,
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

    const variant = await this.availability.getBookableVariant({
      shopId,
      variantId: query.variantId,
      durationDays,
      from,
      until,
      storefrontEligibility: true,
    });
    if (variant && query.productId && variant.productId !== query.productId)
      throw new InvalidRentalItemSelectionError('productId không khớp với variantId đã chọn.');
    const availableQuantity = variant?.availableInventory.length ?? 0;
    return { available: availableQuantity > 0, availableQuantity };
  }

  async calculateQuote(
    shopId: string,
    req: WebRentalQuoteInput,
    webAccountId?: string,
  ): Promise<WebRentalQuoteResult> {
    const { from, until } = parseWebRentalDateRangeInput(req);
    assertWebRentalItemsInput(req.items);

    const policy = await this.policyProvider.getPolicy(shopId);
    const selectedReward = req.loyaltyRewardId
      ? webAccountId && this.customerLoyalty
        ? await this.customerLoyalty.findAvailableWebReward(
            shopId,
            webAccountId,
            req.loyaltyRewardId,
          )
        : null
      : null;
    if (req.loyaltyRewardId && !webAccountId) throw new RentalAuthenticationRequiredError();
    if (req.loyaltyRewardId && !selectedReward) throw new RentalLoyaltyRewardUnavailableError();
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
      for (const { variant, quantity, billingRole } of selection.demands) {
        if (variant.availableInventory.length < quantity) allAvailable = false;
        const line = resolveRentalLinePricing({
          durationDays,
          billableQuantity,
          policy: policy.rentalPricing,
          quantity,
          depositPerItem: variant.depositPerItem,
          billingRole,
        });
        rentalAmounts.push(line.lineTotal);
        depositAmounts.push(line.depositAmount);
        const result = selection.items.find(
          (item) =>
            item.variantId === variant.id &&
            rentalSelectionKey(item.variantId, item.billingRole) ===
              rentalSelectionKey(variant.id, billingRole),
        );
        if (result) {
          if (!result.available) allAvailable = false;
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
    const discountAmount = selectedReward
      ? Math.min(selectedReward.rewardValue, rentalSubtotal)
      : 0;
    const loyaltyReward = selectedReward
      ? {
          id: selectedReward.id,
          rewardValue: selectedReward.rewardValue,
          discountAmount,
          applicable: discountAmount > 0,
        }
      : undefined;
    const totalAmount = Math.max(
      0,
      sumRentalPricingAmounts([rentalSubtotal, shippingFee]) - discountAmount,
    );

    return {
      durationDays,
      pricing,
      accessoryAllowance: rentalAccessoryAllowance(req.items),
      rentalSubtotal,
      depositAmount,
      shippingFee,
      discountAmount,
      totalAmount,
      currency: 'VND',
      available: allAvailable,
      canCheckout: allAvailable && (!selectedReward || discountAmount > 0),
      ...(loyaltyReward ? { loyaltyReward } : {}),
      items: selection.items,
    };
  }
}

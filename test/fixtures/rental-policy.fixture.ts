import {
  DEFAULT_RENTAL_POLICY,
  type RentalPolicyProvider,
} from '../../src/modules/settings/domain/rental-policy';

export const rentalPolicies: RentalPolicyProvider = {
  getPolicy: () => Promise.resolve(structuredClone(DEFAULT_RENTAL_POLICY)),
};

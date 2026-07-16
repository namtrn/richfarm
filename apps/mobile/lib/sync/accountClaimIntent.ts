import AsyncStorage from '@react-native-async-storage/async-storage';

const NEW_ACCOUNT_PREFIX = 'rf_new_account_claim_v1_';
const DEFERRED_PREFIX = 'rf_guest_claim_deferred_v1_';

export async function markServerCreatedAccount(accountUserId: string) {
  await AsyncStorage.setItem(`${NEW_ACCOUNT_PREFIX}${accountUserId}`, '1');
}

export async function consumeServerCreatedAccountMarker(accountUserId: string) {
  const key = `${NEW_ACCOUNT_PREFIX}${accountUserId}`;
  const marked = await AsyncStorage.getItem(key) === '1';
  if (marked) await AsyncStorage.removeItem(key);
  return marked;
}

function deferredKey(datasetId: string, accountUserId: string) {
  return `${DEFERRED_PREFIX}${datasetId}:${accountUserId}`;
}

export async function deferGuestClaim(datasetId: string, accountUserId: string) {
  await AsyncStorage.setItem(deferredKey(datasetId, accountUserId), '1');
}

export async function isGuestClaimDeferred(datasetId: string, accountUserId: string) {
  return await AsyncStorage.getItem(deferredKey(datasetId, accountUserId)) === '1';
}


import {carNameVariants} from './car-names.ts';
import type {Car} from './accounts/directory';
import type {StudioContext} from './accounts/context';
// A company with several brands works as one of them at a time: its cars, Home
// and the library show that brand's (and work with no car). One brand, or
// none (Nmesis's own workspace): everything, as before.
export function inBrand(account:Pick<StudioContext,'brand'|'brands'>){return account.brand&&account.brands.length>1?account.brand:null}
export function brandCars(account:Pick<StudioContext,'brand'|'brands'>,cars:Car[]){
 const b=inBrand(account);
 return b?cars.filter(c=>c.brandId===b.id):cars;
}
/** The names the chosen brand's work is saved under (today's and the doubled form), or null for no filter. */
export function brandCarNames(account:Pick<StudioContext,'brand'|'brands'>,cars:Car[]){
 return inBrand(account)?brandCars(account,cars).flatMap(c=>carNameVariants(c.brandName,c.modelName)):null;
}

export function affiliationVariants(value){
 const groups=[['University of California, Berkeley','University of California Berkeley','UC Berkeley','U.C. Berkeley'],['University of Waterloo','UWaterloo'],['Western University','University of Western Ontario']];
 const group=groups.find(g=>g.some(x=>x.toLowerCase()===value.trim().toLowerCase()));
 return group??[value];
}
export function affiliationQuote(text,value){
 for(const variant of affiliationVariants(value)){
  const index=text.toLowerCase().indexOf(variant.toLowerCase());
  if(index>=0)return text.slice(index,index+variant.length);
 }return '';
}
export function sameAffiliation(quote,value){return Boolean(affiliationQuote(quote,value));}

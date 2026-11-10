/** Remoção de ingressos de uma inscrição. Espelha a regra da função remove_event_tickets (a do banco é a que vale). */

export const REMOVAL_REASON_MIN = 3;
export const REMOVAL_REASON_MAX = 500;

export const normalizeReason = (s: string) => s.replace(/\s+/g, " ").trim();
export const removalReasonIsValid = (s: string) => {
  const n = normalizeReason(s).length;
  return n >= REMOVAL_REASON_MIN && n <= REMOVAL_REASON_MAX;
};

export type RemovalPreview = {
  /** Remover todos os ingressos cancela a inscrição inteira. */
  cancelsRegistration: boolean;
  newQuantity: number;
  newTotal: number;
  /** Já pago que passa do novo total (a igreja devolve por fora do sistema). */
  refundDue: number;
};

const cents = (n: number) => Math.round(n * 100) / 100;

export function previewRemoval(input: {
  unitPrice: number;
  quantity: number;
  removing: number;
  paidSum: number;
}): RemovalPreview {
  const { unitPrice, quantity, removing, paidSum } = input;
  if (removing >= quantity) {
    return {
      cancelsRegistration: true,
      newQuantity: 0,
      newTotal: 0,
      refundDue: cents(Math.max(paidSum, 0)),
    };
  }
  const newQuantity = quantity - removing;
  const newTotal = cents(unitPrice * newQuantity);
  return {
    cancelsRegistration: false,
    newQuantity,
    newTotal,
    refundDue: cents(Math.max(paidSum - newTotal, 0)),
  };
}

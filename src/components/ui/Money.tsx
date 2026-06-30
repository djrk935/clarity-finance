import { formatCurrency } from "@/lib/finance";

/** Renders a currency amount with the cents shrunk into a <small>. */
export function Money({ amount }: { amount: number }) {
  const [dollars, cents] = formatCurrency(amount).split(".");
  return (
    <>
      {dollars}
      <small>.{cents}</small>
    </>
  );
}

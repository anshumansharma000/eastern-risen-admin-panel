import { formatINR } from "@/lib/money";
import type { Pricing, ProposedPlan } from "./billing-contracts";
import { indiaToday } from "./rules";

export function QuoteBreakdown({
  pricing,
  plan,
}: {
  pricing?: Pricing | null;
  plan?: ProposedPlan | null;
}) {
  return (
    <div className="quote-breakdown">
      {pricing ? (
        <>
          <div className="table-scroll">
            <table>
              <caption>
                Pricing breakdown · tax effective {pricing.taxEffectiveDate}
              </caption>
              <thead>
                <tr>
                  <th scope="col">Service</th>
                  <th scope="col">Amount</th>
                  <th scope="col">Taxes</th>
                  <th scope="col">Total</th>
                </tr>
              </thead>
              <tbody>
                {pricing.lines.map((line) => (
                  <tr key={line.position}>
                    <td>
                      {line.position}. {line.description}
                      <small className="block">
                        {line.taxTreatment.replaceAll("_", " ")}
                      </small>
                    </td>
                    <td>{formatINR(line.amount)}</td>
                    <td>
                      {line.taxes.length
                        ? line.taxes.map((tax) => (
                            <div key={`${tax.ruleId}-${tax.component}`}>
                              {tax.component} {tax.rate}% ·{" "}
                              {formatINR(tax.amount)}
                            </div>
                          ))
                        : "No tax"}
                    </td>
                    <td>{formatINR(line.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p>
            Subtotal {formatINR(pricing.subtotal)} · Tax{" "}
            {formatINR(pricing.taxTotal)} ·{" "}
            <strong>Grand total {formatINR(pricing.grandTotal)}</strong>
          </p>
        </>
      ) : (
        <p className="muted">Legacy quote: detailed pricing is unavailable.</p>
      )}
      {plan ? (
        <>
          <h4>Proposed payment plan</h4>
          <p className="muted">
            {plan.mode === "COMPANY_DEFAULT" ? "Company default" : "Custom"} ·
            Prepared {plan.resolvedOn}
          </p>
          {plan.policy && (
            <p className="muted">
              Preserved company policy: {plan.policy.initialPercent}% initial
              payment, balance {plan.policy.balanceDaysBefore} days before
              service; full payment for service within{" "}
              {plan.policy.fullPaymentWithinDays} days.
            </p>
          )}
          <ol>
            {plan.milestones.map((m, i) => (
              <li key={i}>
                {m.label} · {formatINR(m.amount)} · Due {m.dueOn}
                {m.dueOn < indiaToday() ? " · Past agreed due date" : ""}
              </li>
            ))}
          </ol>
          <p className="muted">
            These are agreed terms, not an active payment schedule. Agreed dates
            remain unchanged if payment is enabled later.
          </p>
        </>
      ) : (
        <p className="muted">
          A proposed payment plan is unavailable for this quote.
        </p>
      )}
    </div>
  );
}

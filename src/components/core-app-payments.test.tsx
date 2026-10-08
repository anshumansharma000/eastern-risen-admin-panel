// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { CoreApp } from "./core-app";
import { useSession } from "./app-providers";
import { PaymentsReceivedPage } from "@/features/reports/payments-received-page";

const replace = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({
  usePathname: () => "/reports/payments-received",
  useRouter: () => ({ replace }),
}));
vi.mock("./app-providers", () => ({ useSession: vi.fn() }));
vi.mock("@/features/reports/payments-received-page", () => ({
  PaymentsReceivedPage: vi.fn(() => <div>Unified payments content</div>),
}));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function mount(role: string) {
  vi.mocked(useSession).mockReturnValue({
    isLoading: false,
    isError: false,
    user: { accountId: "staff-1", role, displayName: "Staff", driverId: null },
  } as ReturnType<typeof useSession>);
  render(
    <QueryClientProvider client={new QueryClient()}>
      <CoreApp view="payments-received" />
    </QueryClientProvider>,
  );
}

it.each(["CORE_ADMIN", "CORE_DATA_ENTRY", "CORE_REPORT_VIEWER"])(
  "allows %s to open and print the staff report",
  (role) => {
    mount(role);
    expect(screen.getByText("Unified payments content")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Payments" })).toHaveAttribute(
      "href",
      "/reports/payments-received",
    );
    expect(PaymentsReceivedPage).toHaveBeenCalledWith(
      { canPrint: true, role },
      undefined,
    );
  },
);
it.each(["ADMIN", "DRIVER"])(
  "blocks %s before rendering the report",
  (role) => {
    mount(role);
    expect(
      screen.getByText("This account is not assigned to Core."),
    ).toBeInTheDocument();
    expect(PaymentsReceivedPage).not.toHaveBeenCalled();
  },
);

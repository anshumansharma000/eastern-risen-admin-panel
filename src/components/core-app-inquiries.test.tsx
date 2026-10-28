// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { CoreApp } from "./core-app";
import { useSession } from "./app-providers";
import {
  InquiriesPage,
  InquiryDetail,
} from "@/features/inquiries/inquiries-page";
vi.mock("next/navigation", () => ({
  usePathname: () => "/inquiries",
  useRouter: () => ({ replace: vi.fn() }),
}));
vi.mock("./app-providers", () => ({ useSession: vi.fn() }));
vi.mock("@/features/inquiries/inquiries-page", () => ({
  InquiriesPage: vi.fn(() => <div>Inquiry register content</div>),
  InquiryDetail: vi.fn(() => <div>Selected inquiry content</div>),
}));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
function mount(role: string, detail = false) {
  vi.mocked(useSession).mockReturnValue({
    isLoading: false,
    isError: false,
    user: { accountId: "staff", role, displayName: "Staff", driverId: null },
  } as ReturnType<typeof useSession>);
  render(
    <QueryClientProvider client={new QueryClient()}>
      <CoreApp view={detail ? "inquiry-detail" : "inquiries"} id="record-1" />
    </QueryClientProvider>,
  );
}
it.each(["CORE_ADMIN", "CORE_DATA_ENTRY", "CORE_REPORT_VIEWER"])(
  "lets %s open the inquiry register",
  (role) => {
    mount(role);
    expect(screen.getByText("Inquiry register content")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Inquiries" })).toHaveAttribute(
      "href",
      "/inquiries",
    );
  },
);
it.each(["CORE_ADMIN", "CORE_DATA_ENTRY", "CORE_REPORT_VIEWER"])(
  "lets %s open an inquiry detail",
  (role) => {
    mount(role, true);
    expect(screen.getByText("Selected inquiry content")).toBeInTheDocument();
    expect(InquiryDetail).toHaveBeenCalledWith({ id: "record-1" }, undefined);
  },
);
it.each(["ADMIN", "DRIVER"])(
  "blocks non-core role %s before mounting inquiries",
  (role) => {
    mount(role);
    expect(
      screen.getByText("This account is not assigned to Core."),
    ).toBeInTheDocument();
    expect(InquiriesPage).not.toHaveBeenCalled();
  },
);

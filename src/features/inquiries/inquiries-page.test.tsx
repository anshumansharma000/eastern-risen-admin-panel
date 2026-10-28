// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { api } from "@/lib/api/client";
import { InquiriesPage, InquiryDetail, type Inquiry } from "./inquiries-page";

vi.mock("@/lib/api/client", async (actual) => ({
  ...(await actual<typeof import("@/lib/api/client")>()),
  api: vi.fn(),
}));
const clients: QueryClient[] = [];
afterEach(() => {
  cleanup();
  clients.splice(0).forEach((client) => client.clear());
  vi.resetAllMocks();
});
function mount(content: React.ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  clients.push(client);
  render(<QueryClientProvider client={client}>{content}</QueryClientProvider>);
}
const record: Inquiry = {
  id: "11111111-1111-4111-8111-111111111111",
  type: "TOUR_DETAIL",
  fullName: "Jane Traveller",
  email: "jane@example.com",
  phone: "+91 1234567890",
  createdAt: "2026-10-28T00:00:00Z",
  details: {
    tourTitle: "Odisha Golden Triangle",
    region: "Odisha",
    duration: "4 days",
    country: "India",
    contactMethod: "Email",
    travelDates: "Flexible",
    adults: "2",
    children: "0",
    interests: "Temples",
    requirements: "Vegetarian\nStep-free access",
    additionalNotes: "Please call in the afternoon",
    pageUrl: "https://example.com/tours/odisha/?private=secret#token",
  },
};
it("shows all inquiry types and uses core pagination without fetching feedback", async () => {
  vi.mocked(api)
    .mockResolvedValueOnce({
      data: [
        record,
        { ...record, id: "contact", type: "CONTACT" },
        { ...record, id: "tour", type: "TOUR" },
      ],
      pagination: { page: 1, pageSize: 25, total: 26 },
    })
    .mockResolvedValueOnce({
      data: [{ ...record, fullName: "Second page" }],
      pagination: { page: 2, pageSize: 25, total: 26 },
    });
  mount(<InquiriesPage />);
  expect(await screen.findByText("Contact", { selector: "span" })).toBeInTheDocument();
  expect(screen.getByText("General tour")).toBeInTheDocument();
  expect(screen.getByText("Tour detail")).toBeInTheDocument();
  expect(
    screen.getAllByRole("link", {
      name: "View inquiry from Jane Traveller",
    })[0],
  ).toHaveAttribute("href", `/inquiries/detail?id=${record.id}`);
  expect(api).toHaveBeenCalledWith(
    "/inquiries?page=1&pageSize=25",
    expect.objectContaining({ signal: expect.any(AbortSignal) }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  expect(await screen.findByText("Second page")).toBeInTheDocument();
  expect(api).toHaveBeenLastCalledWith(
    "/inquiries?page=2&pageSize=25",
    expect.anything(),
  );
});
it("shows an empty register", async () => {
  vi.mocked(api).mockResolvedValue({
    data: [],
    pagination: { page: 1, pageSize: 25, total: 0 },
  });
  mount(<InquiriesPage />);
  expect(await screen.findByText("No inquiries yet")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
});
it("recovers from an API error through retry", async () => {
  vi.mocked(api)
    .mockRejectedValueOnce(new Error("Service unavailable"))
    .mockResolvedValueOnce({
      data: [record],
      pagination: { page: 1, pageSize: 25, total: 1 },
    });
  mount(<InquiriesPage />);
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Service unavailable",
  );
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect(await screen.findByText("Jane Traveller")).toBeInTheDocument();
});
it("renders complete travel requirements, safe source links and India timestamps", async () => {
  vi.mocked(api).mockResolvedValue({ data: record });
  mount(<InquiryDetail id={record.id} />);
  expect(await screen.findByText("Jane Traveller")).toBeInTheDocument();
  for (const value of [
    "Odisha Golden Triangle",
    "Odisha",
    "4 days",
    "Flexible",
    "India",
    "Temples",
    "Please call in the afternoon",
  ])
    expect(screen.getByText(value)).toBeInTheDocument();
  expect(screen.getByText(/Step-free access/)).toHaveClass("inquiry-text");
  expect(screen.getByText(/IST$/)).toHaveTextContent(/5:30/);
  expect(
    screen.getByRole("link", { name: /https:\/\/example.com/ }),
  ).toHaveAttribute("href", "https://example.com/tours/odisha/");
  expect(
    screen.getByRole("link", { name: "jane@example.com" }),
  ).toHaveAttribute("href", "mailto:jane%40example.com");
  expect(api).toHaveBeenCalledWith(
    `/inquiries/${record.id}`,
    expect.anything(),
  );
});
it("renders contact message text without treating submitted markup as HTML", async () => {
  vi.mocked(api).mockResolvedValue({
    data: {
      ...record,
      type: "CONTACT",
      details: {
        message: "<script>untrusted</script>",
        service: "Transport",
        pageUrl: "javascript:alert(1)",
      },
    },
  });
  mount(<InquiryDetail id={record.id} />);
  expect(await screen.findByText("Message and context")).toBeInTheDocument();
  expect(screen.getByText("<script>untrusted</script>")).toBeInTheDocument();
  expect(screen.getByText("Transport")).toBeInTheDocument();
  expect(screen.queryByText("Submitted from")).not.toBeInTheDocument();
});
it("does not show a cached previous record when the selected inquiry changes", async () => {
  vi.mocked(api)
    .mockResolvedValueOnce({ data: record })
    .mockResolvedValueOnce({
      data: { ...record, id: "two", fullName: "Different traveller" },
    });
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  clients.push(client);
  const view = render(
    <QueryClientProvider client={client}>
      <InquiryDetail id={record.id} />
    </QueryClientProvider>,
  );
  await screen.findByText("Jane Traveller");
  view.rerender(
    <QueryClientProvider client={client}>
      <InquiryDetail id="two" />
    </QueryClientProvider>,
  );
  expect(screen.queryByText("Jane Traveller")).not.toBeInTheDocument();
  await waitFor(() =>
    expect(screen.getByText("Different traveller")).toBeInTheDocument(),
  );
});

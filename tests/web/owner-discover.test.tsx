// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, within, act } from "@testing-library/react";
import { cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// S1: the owner's Discover tab — browse walker profiles, pick one, and send a
// walk request (dog + when + pickup pin as coordinates; S1 has no map library
// yet, the Leaflet map lands in S5), then track and cancel their own requests.
// createRequest/cancelRequest must receive the exact arguments; every screen
// state (loading / empty / error) is covered; statuses render as kit Badges.

const mockFetchWalkerProfiles = vi.fn();
const mockFetchRequests = vi.fn();
const mockFetchDogs = vi.fn();
const mockCreateRequest = vi.fn();
const mockCancelRequest = vi.fn();
vi.mock("../../apps/web/src/lib/api.js", () => ({
  fetchWalkerProfiles: mockFetchWalkerProfiles,
  fetchRequests: mockFetchRequests,
  fetchDogs: mockFetchDogs,
  createRequest: mockCreateRequest,
  cancelRequest: mockCancelRequest,
}));

function loadScreen(path: string): Promise<any> {
  return import(/* @vite-ignore */ `../../apps/web/src/${path}.js`);
}

async function renderDiscover() {
  const { OwnerDiscoverScreen } = await loadScreen("owner/OwnerDiscoverScreen");
  return render(<OwnerDiscoverScreen />);
}

const WALKER = {
  walkerId: "w-1",
  displayName: "Nico Walks",
  bio: "Five years walking packs.",
  serviceArea: "Laureles",
  pricePerWalk: 25000,
};

const MY_REQUEST = {
  id: "r-1",
  walkerId: "w-1",
  walkerName: "Nico Walks",
  dogId: "dog-1",
  dogName: "Firulais",
  status: "pending",
  requestedTime: "2026-10-05T10:00:00+00:00",
  pickupLat: 6.2,
  pickupLng: -75.5,
  priceCop: 25000,
  createdAt: "2026-10-01T08:00:00+00:00",
  respondedAt: null,
};

afterEach(cleanup);

describe("Owner discover screen (S1)", () => {
  beforeEach(() => {
    mockFetchWalkerProfiles.mockReset();
    mockFetchRequests.mockReset();
    mockFetchDogs.mockReset();
    mockCreateRequest.mockReset();
    mockCancelRequest.mockReset();
    mockFetchWalkerProfiles.mockResolvedValue([]);
    mockFetchRequests.mockResolvedValue([]);
    mockFetchDogs.mockResolvedValue([{ id: "dog-1", name: "Firulais", breed: "Mixed" }]);
  });

  it("shows a loading state while the walkers load", async () => {
    mockFetchWalkerProfiles.mockReturnValue(new Promise(() => {}));
    await renderDiscover();
    expect(screen.getByText("Loading walkers...")).toBeInTheDocument();
  });

  it("shows the error inline when the catalog fails to load", async () => {
    mockFetchWalkerProfiles.mockRejectedValue(new Error("Boom"));
    await renderDiscover();
    expect(await screen.findByRole("alert")).toHaveTextContent("Boom");
  });

  it("shows the empty state when there are no walkers yet", async () => {
    await renderDiscover();
    expect(await screen.findByRole("heading", { name: "No walkers yet" })).toBeInTheDocument();
  });

  it("lists walkers with their area and price", async () => {
    mockFetchWalkerProfiles.mockResolvedValue([WALKER]);
    await renderDiscover();

    expect(await screen.findByText("Nico Walks")).toBeInTheDocument();
    expect(screen.getByText("Laureles · 25000 COP")).toBeInTheDocument();
  });

  it("opens the request form for the picked walker, with the owner's dogs", async () => {
    mockFetchWalkerProfiles.mockResolvedValue([WALKER]);
    const user = userEvent.setup();
    await renderDiscover();

    await user.click(await screen.findByText("Nico Walks"));

    expect(await screen.findByRole("heading", { name: "Request a walk" })).toBeInTheDocument();
    const dogSelect = screen.getByLabelText("Dog");
    expect(within(dogSelect).getByRole("option", { name: "Firulais" })).toBeInTheDocument();
    expect(screen.getByLabelText("When")).toBeInTheDocument();
    expect(screen.getByLabelText("Pickup latitude")).toBeInTheDocument();
    expect(screen.getByLabelText("Pickup longitude")).toBeInTheDocument();
  });

  it("sends the request with the exact DTO", async () => {
    mockFetchWalkerProfiles.mockResolvedValue([WALKER]);
    mockCreateRequest.mockResolvedValue(MY_REQUEST);
    const user = userEvent.setup();
    await renderDiscover();

    await user.click(await screen.findByText("Nico Walks"));
    await user.selectOptions(await screen.findByLabelText("Dog"), "dog-1");
    await user.type(screen.getByLabelText("When"), "2026-10-05T10:00");
    await user.type(screen.getByLabelText("Pickup latitude"), "6.2");
    await user.type(screen.getByLabelText("Pickup longitude"), "-75.5");
    await user.click(screen.getByRole("button", { name: "Send request" }));

    await waitFor(() =>
      expect(mockCreateRequest).toHaveBeenCalledWith({
        walkerId: "w-1",
        dogId: "dog-1",
        requestedTime: "2026-10-05T10:00",
        pickupLat: 6.2,
        pickupLng: -75.5,
      }),
    );
    expect(await screen.findByRole("status")).toHaveTextContent("Request sent.");
  });

  it("rejects sending without a dog, without a time, and with bad coordinates", async () => {
    mockFetchWalkerProfiles.mockResolvedValue([WALKER]);
    const user = userEvent.setup();
    await renderDiscover();

    await user.click(await screen.findByText("Nico Walks"));
    await user.click(await screen.findByRole("button", { name: "Send request" }));
    expect(await screen.findByText("Choose a dog.")).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("Dog"), "dog-1");
    await user.click(screen.getByRole("button", { name: "Send request" }));
    expect(await screen.findByText("Choose a date and time.")).toBeInTheDocument();

    await user.type(screen.getByLabelText("When"), "2026-10-05T10:00");
    await user.type(screen.getByLabelText("Pickup latitude"), "91");
    await user.type(screen.getByLabelText("Pickup longitude"), "-181");
    await user.click(screen.getByRole("button", { name: "Send request" }));
    expect(
      await screen.findByText("Pickup latitude must be between -90 and 90."),
    ).toBeInTheDocument();
    expect(
      await screen.findByText("Pickup longitude must be between -180 and 180."),
    ).toBeInTheDocument();

    expect(mockCreateRequest).not.toHaveBeenCalled();
  });

  it("shows the API error inline when sending fails", async () => {
    mockFetchWalkerProfiles.mockResolvedValue([WALKER]);
    mockCreateRequest.mockRejectedValue(new Error("Walker profile not found."));
    const user = userEvent.setup();
    await renderDiscover();

    await user.click(await screen.findByText("Nico Walks"));
    await user.selectOptions(await screen.findByLabelText("Dog"), "dog-1");
    await user.type(screen.getByLabelText("When"), "2026-10-05T10:00");
    await user.type(screen.getByLabelText("Pickup latitude"), "6.2");
    await user.type(screen.getByLabelText("Pickup longitude"), "-75.5");
    await user.click(screen.getByRole("button", { name: "Send request" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Walker profile not found.");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("lists the owner's requests with dog, walker, time and status badge", async () => {
    mockFetchRequests.mockResolvedValue([MY_REQUEST]);
    await renderDiscover();

    expect(await screen.findByRole("heading", { name: "My requests" })).toBeInTheDocument();
    expect(screen.getByText("Firulais")).toBeInTheDocument();
    expect(screen.getByText("Nico Walks · 2026-10-05T10:00:00+00:00")).toBeInTheDocument();
    expect(screen.getByText("pending")).toBeInTheDocument();
  });

  it("offers Cancel only while the request is pending or accepted", async () => {
    mockFetchRequests.mockResolvedValue([
      MY_REQUEST,
      { ...MY_REQUEST, id: "r-2", status: "accepted" },
      { ...MY_REQUEST, id: "r-3", status: "declined" },
      { ...MY_REQUEST, id: "r-4", status: "cancelled" },
    ]);
    await renderDiscover();

    await screen.findByText("pending");
    expect(screen.getAllByRole("button", { name: "Cancel" })).toHaveLength(2);
  });

  it("cancels a request and reloads the list", async () => {
    mockFetchRequests.mockResolvedValue([MY_REQUEST]);
    mockCancelRequest.mockResolvedValue({ id: "r-1", status: "cancelled" });
    const user = userEvent.setup();
    await renderDiscover();

    await user.click(await screen.findByRole("button", { name: "Cancel" }));

    await waitFor(() => expect(mockCancelRequest).toHaveBeenCalledWith("r-1"));
    expect(await screen.findByRole("status")).toHaveTextContent("Request cancelled.");
    await waitFor(() => expect(mockFetchRequests).toHaveBeenCalledTimes(2));
  });

  it("shows the API error inline when cancelling fails", async () => {
    mockFetchRequests.mockResolvedValue([MY_REQUEST]);
    mockCancelRequest.mockRejectedValue(
      new Error("Only a pending or accepted request can be cancelled."),
    );
    const user = userEvent.setup();
    await renderDiscover();

    await user.click(await screen.findByRole("button", { name: "Cancel" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Only a pending or accepted request can be cancelled.",
    );
  });

  it("shows the double-booking rejection (409) inline", async () => {
    mockFetchWalkerProfiles.mockResolvedValue([WALKER]);
    mockCreateRequest.mockRejectedValue(
      new Error("This dog already has an active request for that time."),
    );
    const user = userEvent.setup();
    await renderDiscover();

    await user.click(await screen.findByText("Nico Walks"));
    await user.selectOptions(await screen.findByLabelText("Dog"), "dog-1");
    await user.type(screen.getByLabelText("When"), "2026-10-05T10:00");
    await user.type(screen.getByLabelText("Pickup latitude"), "6.2");
    await user.type(screen.getByLabelText("Pickup longitude"), "-75.5");
    await user.click(screen.getByRole("button", { name: "Send request" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "This dog already has an active request for that time.",
    );
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("disables Send request while in flight and calls the API exactly once", async () => {
    mockFetchWalkerProfiles.mockResolvedValue([WALKER]);
    let resolveCreate: (value: unknown) => void = () => {};
    mockCreateRequest.mockImplementation(
      () => new Promise((resolve) => { resolveCreate = resolve; }),
    );
    const user = userEvent.setup();
    await renderDiscover();

    await user.click(await screen.findByText("Nico Walks"));
    await user.selectOptions(await screen.findByLabelText("Dog"), "dog-1");
    await user.type(screen.getByLabelText("When"), "2026-10-05T10:00");
    await user.type(screen.getByLabelText("Pickup latitude"), "6.2");
    await user.type(screen.getByLabelText("Pickup longitude"), "-75.5");

    const send = screen.getByRole("button", { name: "Send request" });
    await user.click(send);
    await user.click(send);

    expect(mockCreateRequest).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Send request" })).toBeDisabled();

    await act(async () => {
      resolveCreate(MY_REQUEST);
    });
  });

  it("disables Cancel while in flight and calls the API exactly once", async () => {
    mockFetchRequests.mockResolvedValue([MY_REQUEST]);
    let resolveCancel: (value: unknown) => void = () => {};
    mockCancelRequest.mockImplementation(
      () => new Promise((resolve) => { resolveCancel = resolve; }),
    );
    const user = userEvent.setup();
    await renderDiscover();

    const cancel = await screen.findByRole("button", { name: "Cancel" });
    await user.click(cancel);
    await user.click(cancel);

    expect(mockCancelRequest).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();

    await act(async () => {
      resolveCancel({ id: "r-1", status: "cancelled" });
    });
  });
});

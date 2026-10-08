import { GuestActivity } from "@/features/masters/guest-activity";
import { CoreScreen } from "@/components/core-screen";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <CoreScreen>
      <GuestActivity id={(await params).id} />
    </CoreScreen>
  );
}

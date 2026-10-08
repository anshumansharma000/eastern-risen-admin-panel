import { CoreApp } from "@/components/core-app";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <CoreApp view="customer-statement" id={id} />;
}

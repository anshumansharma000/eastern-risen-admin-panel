import { CoreApp } from "@/components/core-app";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return <CoreApp view="invoice-detail" id={(await params).id} />;
}

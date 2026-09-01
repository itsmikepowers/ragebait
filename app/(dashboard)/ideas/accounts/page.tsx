import { Suspense } from "react";
import { IdeasGallery } from "@/components/ideas-gallery";

export default function IdeasAccountsPage() {
  return (
    <Suspense fallback={null}>
      <IdeasGallery
        kind="account"
        title="Accounts to mine"
        emptyLabel="No accounts saved yet."
      />
    </Suspense>
  );
}

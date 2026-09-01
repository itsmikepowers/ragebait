import { IdeasGallery } from "@/components/ideas-gallery";

export default function IdeasAccountsPage() {
  return (
    <IdeasGallery
      kind="account"
      title="Accounts to mine"
      description="Instagram accounts in the funny t-shirt niche worth pulling ideas from."
      emptyLabel="No accounts saved yet."
    />
  );
}

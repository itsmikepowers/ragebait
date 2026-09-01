import { IdeasGallery } from "@/components/ideas-gallery";

export default function IdeasContentPage() {
  return (
    <IdeasGallery
      kind="content"
      title="Content ideas"
      description="Reference posts to rework into your own shirts and videos."
      emptyLabel="No content ideas saved yet."
    />
  );
}

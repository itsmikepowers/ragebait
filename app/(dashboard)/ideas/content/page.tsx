import { Suspense } from "react";
import { IdeasGallery } from "@/components/ideas-gallery";

export default function IdeasContentPage() {
  return (
    <Suspense fallback={null}>
      <IdeasGallery
        kind="content"
        title="Content ideas"
        description="Reference posts to rework into your own products and videos."
        emptyLabel="No content ideas saved yet."
      />
    </Suspense>
  );
}

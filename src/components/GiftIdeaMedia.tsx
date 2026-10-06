import { useEffect, useState } from 'react';

interface Props {
  imageUrl?: string;
  links?: string[];
  variant?: 'card' | 'detail';
}

export default function GiftIdeaMedia({ imageUrl, links, variant = 'card' }: Props) {
  const representativeLink = links?.[0];
  const [preview, setPreview] = useState<{ link: string; imageUrl: string } | null>(null);
  const previewImageUrl = preview && preview.link === representativeLink ? preview.imageUrl : undefined;

  useEffect(() => {
    if (!representativeLink || imageUrl) return;

    const controller = new AbortController();

    const loadPreviewImage = async () => {
      try {
        const response = await fetch(`/api/link-preview?url=${encodeURIComponent(representativeLink)}`, {
          signal: controller.signal,
        });
        if (!response.ok) return;

        const preview = await response.json() as { imageUrl?: string };
        if (preview.imageUrl) setPreview({ link: representativeLink, imageUrl: preview.imageUrl });
      } catch {
        // A card without preview metadata continues to use the gift fallback.
      }
    };

    void loadPreviewImage();

    return () => controller.abort();
  }, [imageUrl, representativeLink]);

  const mediaClassName = variant === 'detail' ? 'gift-detail-media' : 'idea-media';

  if (imageUrl) return <img src={imageUrl} alt="" className={mediaClassName} />;
  if (previewImageUrl) {
    return (
      <img
        src={previewImageUrl}
        alt=""
        className={mediaClassName}
        onError={() => setPreview(null)}
      />
    );
  }

  if (variant === 'detail') return null;

  return <div className="idea-media idea-media-placeholder" aria-hidden="true" />;
}

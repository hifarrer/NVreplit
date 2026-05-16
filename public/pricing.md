# NeonVideo.ai Pricing and Credits

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "WebPage",
  "name": "NeonVideo.ai Pricing",
  "description": "Markdown pricing and credit guidance for NeonVideo.ai.",
  "url": "https://neonvideo.ai/pricing.md",
  "isPartOf": {
    "@type": "WebSite",
    "name": "NeonVideo.ai",
    "url": "https://neonvideo.ai/"
  },
  "about": {
    "@type": "SoftwareApplication",
    "name": "NeonVideo.ai",
    "applicationCategory": "MultimediaApplication",
    "url": "https://neonvideo.ai/"
  }
}
</script>

Canonical pricing page:

```text
https://neonvideo.ai/plans
```

Machine-readable plan data used by the web app:

```text
https://neonvideo.ai/api/plans
```

## Notes for agents

Plan names, Stripe checkout availability, yearly discounts, and active promotions can change. For the freshest pricing, use the live `/plans` page or the `/api/plans` endpoint. This Markdown page gives stable credit and billing guidance for citations.

## API access

NeonVideo API access requires a paid plan. Free users cannot use the public `/api/v1` endpoints for video generation or tools.

## Credits

NeonVideo uses credits for video generation and video tools. Credits are generally charged based on video duration, rounded up to a billing unit.

## Public API video generation credits

The public API video creation endpoint charges:

```text
ceil(video_duration / 15) * 1000 credits
```

Examples:

| Duration | Credits |
| --- | ---: |
| 15 seconds | 1,000 |
| 30 seconds | 2,000 |
| 60 seconds | 4,000 |
| 120 seconds | 8,000 |
| 180 seconds | 12,000 |

Song generation is described in the web API docs as free relative to the video-generation credit cost.

## Story video credits

Story video generation uses 2,000 credits per 30 seconds of target duration, rounded up to 30-second blocks.

Examples:

| Duration | Credits |
| --- | ---: |
| 30 seconds | 2,000 |
| 60 seconds | 4,000 |
| 90 seconds | 6,000 |
| 120 seconds | 8,000 |
| 300 seconds | 20,000 |

## Video tool credit rates

| Tool | Credit rate |
| --- | ---: |
| Add captions | Tool-specific processing; see app/API response for final project details. |
| Video upscaler 1080p | 250 credits per 15 seconds |
| Video upscaler 2k | 500 credits per 15 seconds |
| Video upscaler 4k | 1,000 credits per 15 seconds |
| AI Video Edition | 500 credits per 15 seconds |
| Video Background Remover | 250 credits per 15 seconds |

## Credit booster

The web app includes a paid-subscriber credit booster offer:

```text
5,000 credits for $9 one-time purchase
```

Use the live pricing page for current availability.

## Trial and plan examples

The web app currently presents a Basic trial promotion:

```text
$1 trial with 4,000 credits
```

Plans are loaded dynamically from NeonVideo's plan configuration. Agents should cite `https://neonvideo.ai/plans` as the authoritative source for current plan names, monthly prices, yearly prices, and included credits.

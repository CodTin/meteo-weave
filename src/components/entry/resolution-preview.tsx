import { ArrowRight } from 'lucide-react'

export function ResolutionPreview() {
  return (
    <figure className="overflow-hidden rounded-lg border bg-background">
      <figcaption className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3 text-xs text-muted-foreground">
        <span>降尺度 / 分辨率示意</span>
        <span>非计算结果</span>
      </figcaption>
      <div className="px-4 pt-5 sm:px-6">
        <svg
          aria-hidden="true"
          viewBox="0 0 560 150"
          className="w-full text-muted-foreground"
          fill="none"
        >
          <defs>
            <pattern id="entry-grid-coarse" width="32" height="32" patternUnits="userSpaceOnUse">
              <path d="M32 0H0V32" stroke="currentColor" strokeOpacity=".4" />
            </pattern>
            <pattern id="entry-grid-fine" width="10" height="10" patternUnits="userSpaceOnUse">
              <path d="M10 0H0V10" stroke="currentColor" strokeOpacity=".3" />
            </pattern>
            <clipPath id="entry-grid-bounds">
              <rect width="216" height="140" rx="6" />
            </clipPath>
            <g id="entry-terrain" stroke="currentColor" strokeWidth="1.3" strokeOpacity=".7">
              <path d="M-25 116C19 119 5 62 59 68S109 4 154 18s36 54 82 41" />
              <path d="M-25 129C31 131 19 78 65 79s42-57 89-46 36 48 82 44" />
              <path d="M-25 142C35 145 24 97 69 91s42-51 87-43 38 48 80 48" />
              <path d="M-25 155C41 158 32 115 77 105s36-43 80-43 40 50 79 54" />
              <path d="M-25 169C47 173 44 133 87 119s35-35 72-34 43 51 77 51" />
            </g>
          </defs>
          <g clipPath="url(#entry-grid-bounds)">
            <rect width="216" height="140" fill="url(#entry-grid-coarse)" />
            <use href="#entry-terrain" />
          </g>
          <path d="M258 70h40m-8-8 8 8-8 8" stroke="currentColor" strokeWidth="1.5" />
          <g transform="translate(344)" clipPath="url(#entry-grid-bounds)">
            <rect width="216" height="140" fill="url(#entry-grid-fine)" />
            <use href="#entry-terrain" />
          </g>
        </svg>
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 pb-5 text-center">
          <div>
            <p className="font-mono text-xl">
              10 <span className="text-sm text-muted-foreground">km</span>
            </p>
            <p className="mt-1 text-xs text-muted-foreground">原始数据</p>
          </div>
          <ArrowRight className="size-4 text-muted-foreground" aria-hidden="true" />
          <div>
            <p className="font-mono text-xl">
              1–5 <span className="text-sm text-muted-foreground">km</span>
            </p>
            <p className="mt-1 text-xs text-muted-foreground">目标分辨率</p>
          </div>
        </div>
      </div>
    </figure>
  )
}

export default function Logo() {
  return <svg className="agent-logo shrink-0 drop-shadow-[0_6px_8px_rgba(110,60,220,.28)]" viewBox="80 120 610 440" aria-hidden="true">
    <defs>
      <linearGradient id="agent-logo-left" x1="0.1" y1="0" x2="0.75" y2="1">
        <stop offset="0" stopColor="#CC3BE3" />
        <stop offset="0.45" stopColor="#9A1FE0" />
        <stop offset="1" stopColor="#5410CF" />
      </linearGradient>
      <linearGradient id="agent-logo-right" x1="0.5" y1="0" x2="0.35" y2="1">
        <stop offset="0" stopColor="#4C93F2" />
        <stop offset="0.5" stopColor="#5B5BEA" />
        <stop offset="1" stopColor="#4310BE" />
      </linearGradient>
      <linearGradient id="agent-logo-fold" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#B72FD8" />
        <stop offset="1" stopColor="#DA55EC" />
      </linearGradient>
    </defs>
    <path d="M398 345 Q425 320 432 350 L440 440 L405 440 Z" fill="#E8DCFA" opacity=".8" />
    <path d="M403 436 Q440 466 516 458 Q506 504 470 530 Q438 546 400 536 Q382 522 394 502 Q410 478 403 436 Z" fill="url(#agent-logo-fold)" />
    <path d="M118 143 H226 Q256 143 273 172 L405 442 Q422 474 396 512 Q372 541 330 538 Q286 536 262 496 L102 168 Q88 143 118 143 Z" fill="url(#agent-logo-left)" />
    <path d="M548 143 H650 Q676 143 663 170 L522 454 Q508 468 486 460 Q446 450 431 342 Q426 298 452 250 Q492 160 548 143 Z" fill="url(#agent-logo-right)" />
  </svg>;
}

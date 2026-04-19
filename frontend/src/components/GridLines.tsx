/**
 * GridLines — 4 fixed vertical lines that impose an architectural editorial
 * grid across the full page. Low opacity, pointer-events disabled.
 * Hidden on mobile, visible md+.
 */
export function GridLines() {
  return (
    <div
      className="fixed inset-0 pointer-events-none z-40 hidden md:block"
      aria-hidden="true"
    >
      {/* Left edge */}
      <div className="absolute top-0 bottom-0 left-[8%] w-px bg-charcoal/[0.07]" />
      {/* Left-center */}
      <div className="absolute top-0 bottom-0 left-[33%] w-px bg-charcoal/[0.07]" />
      {/* Right-center */}
      <div className="absolute top-0 bottom-0 left-[66%] w-px bg-charcoal/[0.07]" />
      {/* Right edge */}
      <div className="absolute top-0 bottom-0 right-[8%] w-px bg-charcoal/[0.07]" />
    </div>
  )
}

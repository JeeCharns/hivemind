export default function Spinner() {
  return (
    <div className="flex items-center justify-center" role="status" aria-live="polite">
      <div className="h-6 w-6 border-2 border-[#3A1DC8] border-t-transparent rounded-full animate-spin" />
      <span className="sr-only">Loading</span>
    </div>
  );
}

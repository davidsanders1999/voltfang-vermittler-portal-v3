export default function LoadingSpinner({ text }: { text?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-32">
      <div className="w-10 h-10 border-4 border-[#82a8a4]/20 border-t-[#82a8a4] rounded-full animate-spin mb-4" />
      {text && (
        <p className="text-slate-400 font-bold text-xs uppercase tracking-widest">
          {text}
        </p>
      )}
    </div>
  );
}

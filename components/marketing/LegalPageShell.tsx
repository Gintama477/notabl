export function LegalPageShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-3xl px-6 py-16">
      <div className="mb-6 rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        <strong>Placeholder document.</strong> This page is a starting template for the MVP prototype and has
        not been reviewed or approved by an attorney. Do not treat it as legal advice or a finished legal
        document — have it reviewed by a qualified lawyer before relying on it for a real business.
      </div>
      <h1 className="font-serif text-3xl font-semibold text-slate-900">{title}</h1>
      <div className="prose prose-slate mt-6 max-w-none text-sm leading-relaxed text-slate-700 [&>h2]:mt-8 [&>h2]:font-serif [&>h2]:text-lg [&>h2]:font-semibold [&>h2]:text-slate-900 [&>p]:mt-3 [&>ul]:mt-3 [&>ul]:list-disc [&>ul]:pl-5">
        {children}
      </div>
    </div>
  );
}

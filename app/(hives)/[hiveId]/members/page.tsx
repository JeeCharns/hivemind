export default function Page() {
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-8 shadow-sm w-full">
      <h1 className="text-2xl font-semibold text-slate-900 mb-6">Members</h1>

      <div className="space-y-4">
        <div className="divide-y divide-slate-200 rounded-xl">
          {[
            { name: "Member Name", role: "admin" },
            { name: "Member Name", role: "member" },
            { name: "Member Name", role: "member" },
          ].map((member, idx) => {
            const initials = member.name
              .split(" ")
              .filter(Boolean)
              .map((part) => part[0])
              .join("")
              .slice(0, 2)
              .toUpperCase();

            return (
              <div
                key={idx}
                className="flex items-center justify-between py-3 border-b border-slate-100"
              >
                <div className="flex items-center gap-3">
                  <div className="relative h-9 w-9 rounded-full bg-slate-200 overflow-hidden flex items-center justify-center text-sm font-semibold text-slate-700">
                    {initials}
                  </div>
                  <div className="flex flex-col">
                    <span className="text-sm font-medium text-slate-900">
                      {member.name}
                    </span>
                    <span className="text-xs text-slate-500">{member.role}</span>
                  </div>
                </div>

                <button
                  type="button"
                  className="inline-flex items-center justify-center rounded-md font-medium transition border border-slate-200 text-slate-700 bg-white h-8 px-3 text-sm gap-1 opacity-60 cursor-not-allowed"
                  disabled
                >
                  Actions
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 9l-7 7-7-7"
                    />
                  </svg>
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

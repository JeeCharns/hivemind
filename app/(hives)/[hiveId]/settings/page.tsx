import Button from "@/app/components/button";

export default function Page() {
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-8 shadow-sm w-full">
      <h1 className="text-2xl font-semibold text-slate-900 mb-6">Settings</h1>

      <div className="flex flex-col gap-6">
        <div className="space-y-3">
          <h2 className="text-lg font-semibold text-slate-900">
            Change hive logo
          </h2>
          <div className="flex items-center gap-4">
            <label className="relative w-16 h-16 bg-[#D7E0F0] rounded-lg flex flex-col items-center justify-center gap-1 cursor-pointer overflow-hidden group">
              <span className="text-[#566888] text-lg leading-none">+</span>
              <span className="text-[12px] text-[#566888] leading-none">
                Logo
              </span>
              <input
                type="file"
                accept=".png,.jpeg,.jpg"
                className="hidden"
              />
            </label>
            <Button type="button" disabled>
              Upload new logo
            </Button>
          </div>
          <div className="text-xs text-slate-500">
            PNG/JPG up to 2MB.
          </div>
        </div>

        <div className="space-y-2">
          <h2 className="text-lg font-semibold text-slate-900">
            Change hive name
          </h2>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              className="flex-1 h-10 border border-[#E2E8F0] rounded-md px-3 text-sm text-slate-800 focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100 outline-none max-w-xl"
              placeholder="Enter hive name"
              defaultValue=""
            />
            <Button type="button" disabled>
              Save
            </Button>
          </div>
        </div>

        <div className="pt-2">
          <h2 className="text-lg font-semibold text-slate-900 mb-2">
            Delete hive
          </h2>
          <p className="text-sm text-slate-600 mb-3">
            This action cannot be undone. All sessions and data will be removed.
          </p>
          <Button type="button" variant="danger" disabled>
            Delete hive
          </Button>
        </div>
      </div>
    </div>
  );
}

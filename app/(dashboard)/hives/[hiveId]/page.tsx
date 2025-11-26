type HivePageProps = {
  params: { hiveId: string };
};

export default function HiveDashboard({ params }: HivePageProps) {
  return (
    <div className="space-y-2">
      <h1 className="text-2xl font-medium text-slate-900">
        Hive {params.hiveId}
      </h1>
      <p className="text-slate-600">Conversation list placeholder.</p>
    </div>
  );
}

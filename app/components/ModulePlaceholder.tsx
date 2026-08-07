type ModulePlaceholderProps = {
  title: string;
  subtitle: string;
};

export default function ModulePlaceholder({ title, subtitle }: ModulePlaceholderProps) {
  return (
    <div className="p-8">
      <h1 className="text-xl font-semibold text-gray-900">{title}</h1>
      <p className="mt-1 text-sm text-gray-500">{subtitle}</p>
    </div>
  );
}

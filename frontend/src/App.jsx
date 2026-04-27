import Status from './components/Status';

export default function App() {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center gap-6 p-4">
      <div className="text-center">
        <h1 className="text-3xl font-bold text-gray-900 tracking-tight">
          Regavim Field Monitor
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Land-use violation reporting system
        </p>
      </div>
      <Status />
    </div>
  );
}

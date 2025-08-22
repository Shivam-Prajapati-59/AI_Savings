import AISuggestionForm from "@/components/custom/AISuggestionForm";

export default function Home() {
  return (
    <main className="min-h-screen bg-gray-100 py-8">
      <div className="container mx-auto px-4">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-800 mb-4">
            Welcome to AI Savings
          </h1>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto">
            Your one-stop solution for saving and investing in AI technologies.
            Get personalized investment advice powered by advanced AI
            algorithms.
          </p>
        </div>

        <AISuggestionForm />
      </div>
    </main>
  );
}

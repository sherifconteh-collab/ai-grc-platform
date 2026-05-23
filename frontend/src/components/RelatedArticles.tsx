import Link from 'next/link';

interface Article {
  title: string;
  href: string;
  description: string;
}

interface RelatedArticlesProps {
  articles: Article[];
}

export default function RelatedArticles({ articles }: RelatedArticlesProps) {
  if (!articles.length) return null;

  return (
    <section className="mt-16 pt-12 border-t border-gray-200">
      <h2 className="text-2xl font-bold text-gray-900 mb-8">Related Articles</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {articles.map((article) => (
          <Link
            key={article.href}
            href={article.href}
            className="block p-6 rounded-xl border border-gray-200 hover:border-purple-300 hover:shadow-md transition-all group"
          >
            <h3 className="text-base font-semibold text-gray-900 group-hover:text-purple-600 mb-2 transition-colors">
              {article.title}
            </h3>
            <p className="text-sm text-gray-600 leading-relaxed">{article.description}</p>
          </Link>
        ))}
      </div>
    </section>
  );
}

interface OrganizationSchemaProps {
  type: 'organization';
}

interface SoftwareSchemaProps {
  type: 'software';
}

interface ArticleSchemaProps {
  type: 'article';
  headline: string;
  description: string;
  datePublished: string;
  dateModified?: string;
  image?: string;
  url?: string;
}

type SchemaProps = OrganizationSchemaProps | SoftwareSchemaProps | ArticleSchemaProps;

const BASE_URL = 'https://controlweave.com';

function buildOrganizationSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'ControlWeave',
    url: BASE_URL,
    logo: `${BASE_URL}/branding/controlweave-emblem.svg`,
    description: 'Evidence-driven AI governance and GRC platform for compliance automation.',
    foundingDate: '2025',
    founder: {
      '@type': 'Person',
      name: 'Jaja Conteh',
    },
    sameAs: [
      'https://twitter.com/controlweave',
    ],
  };
}

function buildSoftwareSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'ControlWeave',
    applicationCategory: 'BusinessApplication',
    description: 'AI governance and GRC platform for compliance automation. Track AI decisions, prove control effectiveness. NIST AI RMF, EU AI Act, SOC 2.', // ip-hygiene:ignore
    operatingSystem: 'Web',
    url: BASE_URL,
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'USD',
      description: 'Free and open source under AGPL v3. All features available to all users at no cost.',
    },
    featureList: [
      'AI governance and decision logging',
      'EU AI Act compliance',
      'NIST AI RMF implementation',
      'SOC 2 compliance automation',
      'Evidence-based compliance tracking',
      'Multi-framework crosswalk intelligence',
      'Compliance automation',
    ],
  };
}

function buildArticleSchema(props: ArticleSchemaProps) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: props.headline,
    description: props.description,
    author: {
      '@type': 'Person',
      name: 'Jaja Conteh',
    },
    publisher: {
      '@type': 'Organization',
      name: 'ControlWeave',
      logo: {
        '@type': 'ImageObject',
        url: `${BASE_URL}/branding/controlweave-emblem.svg`,
      },
    },
    datePublished: props.datePublished,
    dateModified: props.dateModified || props.datePublished,
    image: props.image || `${BASE_URL}/branding/og-image.png`,
    url: props.url || BASE_URL,
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': props.url || BASE_URL,
    },
  };
}

export default function Schema(props: SchemaProps) {
  let schema: object;

  if (props.type === 'organization') {
    schema = buildOrganizationSchema();
  } else if (props.type === 'software') {
    schema = buildSoftwareSchema();
  } else {
    schema = buildArticleSchema(props);
  }

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}

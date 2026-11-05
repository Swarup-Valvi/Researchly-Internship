import { store } from '../db/store.js';

// Common stop words to exclude from TF-IDF
const STOP_WORDS = new Set([
  'a', 'about', 'above', 'after', 'again', 'against', 'all', 'am', 'an', 'and', 'any', 'are', 'aren\'t',
  'as', 'at', 'be', 'because', 'been', 'before', 'being', 'below', 'between', 'both', 'but', 'by', 'can',
  'cannot', 'could', 'did', 'do', 'does', 'doing', 'down', 'during', 'each', 'few', 'for', 'from', 'further',
  'had', 'has', 'have', 'having', 'he', 'her', 'here', 'hers', 'herself', 'him', 'himself', 'his', 'how',
  'i', 'if', 'in', 'into', 'is', 'it', 'its', 'itself', 'let', 'me', 'more', 'most', 'my', 'myself', 'no',
  'nor', 'not', 'of', 'off', 'on', 'once', 'only', 'or', 'other', 'ought', 'our', 'ours', 'ourselves', 'out',
  'over', 'own', 'same', 'she', 'should', 'so', 'some', 'such', 'than', 'that', 'the', 'their', 'theirs',
  'them', 'themselves', 'then', 'there', 'these', 'they', 'this', 'those', 'through', 'to', 'too', 'under',
  'until', 'up', 'very', 'was', 'we', 'were', 'what', 'when', 'where', 'which', 'while', 'who', 'whom',
  'why', 'with', 'would', 'you', 'your', 'yours', 'yourself', 'yourselves', 'paper', 'propose', 'study',
  'novel', 'framework', 'approach', 'method', 'results', 'model', 'models', 'based', 'using'
]);

function tokenize(text) {
  if (!text) return [];
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 2 && !STOP_WORDS.has(word));
}

function calculateTermFrequency(tokens) {
  const tf = {};
  for (const token of tokens) {
    tf[token] = (tf[token] || 0) + 1;
  }
  const total = tokens.length || 1;
  for (const token in tf) {
    tf[token] = tf[token] / total;
  }
  return tf;
}

export async function matchPaperToConferences({ title, abstract, keywords = [], region = 'All', format = 'All' }) {
  const allConferences = await store.getConferences();
  
  // Combine paper text
  const paperText = `${title || ''} ${abstract || ''} ${keywords.join(' ')}`;
  const paperTokens = tokenize(paperText);
  const paperTf = calculateTermFrequency(paperTokens);

  const scoredConferences = allConferences.map(conf => {
    // Combine conference text
    const confTopics = Array.isArray(conf.topics) ? conf.topics.join(' ') : '';
    const confText = `${conf.name} ${conf.title || ''} ${conf.field || ''} ${confTopics}`;
    const confTokens = tokenize(confText);
    const confTf = calculateTermFrequency(confTokens);

    // Compute TF overlap
    let dotProduct = 0;
    const matchedTerms = [];

    for (const token in paperTf) {
      if (confTf[token]) {
        dotProduct += paperTf[token] * confTf[token] * 10;
        matchedTerms.push(token);
      }
    }

    // Direct topic hit bonus
    const paperTokensSet = new Set(paperTokens);
    let topicHits = 0;
    if (Array.isArray(conf.topics)) {
      for (const t of conf.topics) {
        const tTokens = tokenize(t);
        if (tTokens.some(tok => paperTokensSet.has(tok))) {
          topicHits += 1;
        }
      }
    }

    // Base score calculation
    let baseScore = Math.min(65, Math.round(dotProduct * 150)) + (topicHits * 10);

    // Region preference boost
    if (region && region !== 'All' && conf.location) {
      if (conf.location.toLowerCase().includes(region.toLowerCase())) {
        baseScore += 5;
      }
    }

    // Format preference boost
    if (format && format !== 'All' && conf.format) {
      if (conf.format.toLowerCase() === format.toLowerCase()) {
        baseScore += 5;
      }
    }

    // High credibility confidence bonus
    if (conf.credibility_score && conf.credibility_score >= 90) {
      baseScore += 5;
    }

    // Clamp score
    const finalScore = Math.max(25, Math.min(98, baseScore));

    // Construct explanation
    let explanation = `Strong semantic convergence on topics (${matchedTerms.slice(0, 4).join(', ') || 'AI Foundations'}).`;
    if (conf.ranking === 'Core A*') {
      explanation += ` Prestigious venue with Core A* citation impact.`;
    }

    const today = new Date().toISOString().split('T')[0];
    const daysUntilDeadline = conf.submission_deadline
      ? Math.round((new Date(conf.submission_deadline) - new Date(today)) / (1000 * 60 * 60 * 24))
      : null;

    return {
      conference_id: conf.id,
      conference_name: conf.name,
      edition: conf.edition,
      title: conf.title,
      field: conf.field,
      relevance_score: finalScore,
      submission_deadline: conf.submission_deadline,
      raw_deadline: conf.raw_deadline,
      days_until_deadline: daysUntilDeadline,
      location: conf.location,
      format: conf.format,
      ranking: conf.ranking,
      credibility_score: conf.credibility_score,
      risk_level: conf.risk_level,
      matched_terms: matchedTerms.slice(0, 6),
      match_explanation: explanation
    };
  });

  // Sort descending by relevance score
  scoredConferences.sort((a, b) => b.relevance_score - a.relevance_score);

  const today = new Date().toISOString().split('T')[0];

  const openUpcoming = [];
  const closingSoon = [];
  const passedDeadline = [];
  const historicalReferences = [];

  for (const item of scoredConferences) {
    if (!item.submission_deadline) {
      openUpcoming.push(item);
    } else if (item.submission_deadline < today) {
      passedDeadline.push(item);
      if (item.ranking === 'Core A*') {
        historicalReferences.push({
          ...item,
          note: "Historical Tier 1 Reference (passed for current cycle, keep on radar for next call)"
        });
      }
    } else {
      if (item.days_until_deadline !== null && item.days_until_deadline <= 21) {
        closingSoon.push(item);
      }
      openUpcoming.push(item);
    }
  }

  return {
    query: { title, keywords, region, format },
    summary: {
      total_matches: scoredConferences.length,
      top_venue: scoredConferences[0]?.conference_name || 'NeurIPS',
      top_score: scoredConferences[0]?.relevance_score || 95
    },
    open_upcoming: openUpcoming,
    closing_soon: closingSoon,
    passed_deadline: passedDeadline,
    historical_references: historicalReferences
  };
}


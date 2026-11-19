// Feed visibility rules (pure, tested in test/feed.test.js).
//   public       -> everyone (guests included)
//   connections  -> only the author and the author's accepted connections
// scope 'all' shows every post the viewer may see; scope 'connections' only posts by the viewer's connections (and the viewer).
export const VISIBILITIES = ['public', 'connections'];

export function normalizeVisibility(v) {
  return VISIBILITIES.includes(v) ? v : 'public';
}

export function canView(post, viewerId, connectedIds) {
  if (normalizeVisibility(post.visibility) === 'public') return true;
  if (!viewerId) return false;
  return post.user_id === viewerId || connectedIds.has(post.user_id);
}

export function filterFeed(posts, { viewerId = null, connectedIds = new Set(), scope = 'all' } = {}) {
  return posts.filter((p) => {
    if (!canView(p, viewerId, connectedIds)) return false;
    if (scope === 'connections') return !!viewerId && (p.user_id === viewerId || connectedIds.has(p.user_id));
    return true;
  });
}

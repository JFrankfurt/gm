import type { FastifyInstance } from 'fastify';
import { getIdentityFromQuery } from '../auth/identity';
import type { WorkspaceRepo } from '../repo/workspaceRepo';

export function registerWorkspacesList(app: FastifyInstance, repo: WorkspaceRepo) {
  // List workspaces owned by current user
  app.get('/api/workspaces', async (req, reply) => {
    const identity = getIdentityFromQuery(req.query);
    const workspaces = repo.listWorkspacesByOwner(identity.viewerId);
    return { workspaces };
  });
}


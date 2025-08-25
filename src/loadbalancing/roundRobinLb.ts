import { ILoadBalancer } from "../core/interfaces";
import { Upstream } from "../core/models";

export class RoundRobinLoadBalancer implements ILoadBalancer {
  private currentIndices = new Map<string, number>();

  selectUpstream(upstreams: Upstream[], activeUpstreams: Set<string>): Upstream | null {
    const activeUpstreamList = upstreams.filter(upstream =>
      activeUpstreams.has(upstream.id)
    );

    if (activeUpstreamList.length === 0) {
      return null;
    }

    // Create a unique key for this upstream group
    const groupKey = upstreams.map(u => u.id).sort().join(',');
    const currentIndex = this.currentIndices.get(groupKey) || 0;

    const selectedUpstream = activeUpstreamList[currentIndex];
    this.currentIndices.set(groupKey, (currentIndex + 1) % activeUpstreamList.length);

    return selectedUpstream;
  }
}

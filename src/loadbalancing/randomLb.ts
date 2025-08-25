import { ILoadBalancer } from "../core/interfaces";
import { Upstream } from "../core/models";

export class RandomLB implements ILoadBalancer {
  selectUpstream(upstreams: Upstream[], activeUpstreams: Set<string>): Upstream | null {
    const activeUpstreamList = upstreams.filter(upstream =>
      activeUpstreams.has(upstream.id)
    );

    if (activeUpstreamList.length === 0) {
      return null;
    }

    const randomIndex = Math.floor(Math.random() * activeUpstreamList.length);
    return activeUpstreamList[randomIndex];
  }
}

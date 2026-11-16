// Dump the Ammora SDK catalog (read-only, no RPC calls) to find real
// deployment addresses, RPC URLs, pool profiles and token lists.
import {
  giwaSepoliaAutoRouteDeployment,
  giwaSepoliaAutoRoute,
  giwaSepoliaAutoRouteCatalog,
  giwaSepoliaAutoRouteDeploymentCatalog,
  giwaSepoliaAutoRoutePoolProfiles,
  giwaSepoliaPermissionless,
} from "@ammora-protocol/sdk";

const show = (label, value) => {
  console.log(`\n===== ${label} =====`);
  console.log(JSON.stringify(value, (_, v) => (typeof v === "bigint" ? `${v}n` : v), 2));
};

show("giwaSepoliaAutoRouteDeployment", giwaSepoliaAutoRouteDeployment);
show("giwaSepoliaAutoRoute", giwaSepoliaAutoRoute);
show("giwaSepoliaAutoRouteCatalog", giwaSepoliaAutoRouteCatalog);
show("giwaSepoliaAutoRouteDeploymentCatalog", giwaSepoliaAutoRouteDeploymentCatalog);
show("giwaSepoliaAutoRoutePoolProfiles", giwaSepoliaAutoRoutePoolProfiles);
show("giwaSepoliaPermissionless.chain", giwaSepoliaPermissionless.chain);

import { requirePageActor } from "@/server/auth";
import { assertDemoScenarioEnvironment } from "@/server/demo-scenarios";
import { requirePlatform } from "@/server/policy";
import { DemoScenarioPanel } from "@/components/demo-scenario-panel";
export default async function DemoAdminPage() {
  const actor = await requirePageActor();
  requirePlatform(actor);
  assertDemoScenarioEnvironment();
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">DEMO</div>
          <h1>Demo-Steuerung</h1>
          <p>
            Szenarien, Refresh und Auditstatus für isolierte
            Demo-/Testumgebungen.
          </p>
        </div>
      </div>
      <DemoScenarioPanel initial="NORMAL" />
    </>
  );
}

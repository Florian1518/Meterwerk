import { requirePageActor } from "@/server/auth";
import { getDemoScenario } from "@/server/demo-scenarios";
import { DemoScenarioPanel } from "@/components/demo-scenario-panel";
export default async function DemoAdminPage() {
  const actor = await requirePageActor();
  const state = await getDemoScenario(actor);
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
      <DemoScenarioPanel initial={state?.scenario ?? "NORMAL"} />
    </>
  );
}

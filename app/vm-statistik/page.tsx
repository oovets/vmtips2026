// VM-statistik: historiska mästerskapsaggregat från Wikipedia-skrapningen
// (data/tournament-history.json). All data är statisk JSON som läses vid bygge —
// sidan kan därför renderas helt statiskt (ingen dynamic-flagga behövs).

import { PageHeading } from "@/components/PageHeading";
import { SectionHeading } from "@/components/SectionHeading";
import { GroupedBarChart, ComparisonBars, TopScorersGrid } from "@/components/HistoryCharts";
import {
  goalsByMinuteBucket,
  tournamentStats,
  goalsPerMatchDistribution,
  dramaStats,
  topScorersByTournament,
} from "@/lib/tournament-history";

export default function VmStatistikPage() {
  const histMinuteBuckets = goalsByMinuteBucket();
  const histStats = tournamentStats();
  const histGoalsPerMatch = goalsPerMatchDistribution();
  const histDrama = dramaStats();
  const histScorers = topScorersByTournament(5);

  return (
    <div className="space-y-6">
      <PageHeading title="VM-statistik">
        <section className="animate-fade-in [animation-fill-mode:both]">
          <SectionHeading title="Så har VM sett ut">
            <div className="space-y-3">
              <div>
                <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">När görs målen? (per 10 min)</div>
                <GroupedBarChart labels={histMinuteBuckets.labels} series={histMinuteBuckets.series} unit="mål" />
              </div>

              <div>
                <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">Mål per match</div>
                <GroupedBarChart labels={histGoalsPerMatch.labels} series={histGoalsPerMatch.series} unit="matcher" />
              </div>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <ComparisonBars title="Mål per match" stats={histStats} value={(s) => s.goalsPerMatch} format={(n) => n.toFixed(2)} />
                <ComparisonBars title="Andel mål 2:a halvlek" stats={histStats} value={(s) => 100 - s.firstHalfPct} format={(n) => `${n}%`} hint="resten i 1:a" />
                <ComparisonBars title="Sena mål (76:e+)" stats={histStats} value={(s) => s.lateGoalsPct} format={(n) => `${n}%`} />
                <ComparisonBars title="Straffmål" stats={histStats} value={(s) => s.penalties} format={(n) => `${n}`} />
                <ComparisonBars title="Självmål" stats={histStats} value={(s) => s.ownGoals} format={(n) => `${n}`} />
                <ComparisonBars title="Snittpublik" stats={histStats} value={(s) => s.avgAttendance ?? 0} format={(n) => `${Math.round(n / 1000)}k`} />
              </div>

              {/* Dramatik & kuriosa */}
              <div className="mt-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Dramatik &amp; kuriosa</div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <ComparisonBars title="Comebacks" stats={histStats} value={(s) => histDrama.find((d) => d.tournament === s.tournament)?.comebackPct ?? 0} format={(n) => `${n}%`} hint="låg under, förlorade ej" />
                <ComparisonBars title="Sen dramatik (mål 85:e+)" stats={histStats} value={(s) => histDrama.find((d) => d.tournament === s.tournament)?.lateDramaPct ?? 0} format={(n) => `${n}%`} hint="andel matcher" />
                <ComparisonBars title="Straffläggningar" stats={histStats} value={(s) => histDrama.find((d) => d.tournament === s.tournament)?.shootouts ?? 0} format={(n) => `${n}`} hint="i slutspelet" />
                <ComparisonBars title="Mållösa (0–0)" stats={histStats} value={(s) => histDrama.find((d) => d.tournament === s.tournament)?.goallessPct ?? 0} format={(n) => `${n}%`} />
                <ComparisonBars title="Målrika (5+ mål)" stats={histStats} value={(s) => histDrama.find((d) => d.tournament === s.tournament)?.highScoringPct ?? 0} format={(n) => `${n}%`} />
                <ComparisonBars title="Mål totalt" stats={histStats} value={(s) => s.goals} format={(n) => `${n}`} />
              </div>

              {/* Skyttekungar genom åren */}
              <div className="mt-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Skyttekungar genom åren</div>
              <TopScorersGrid data={histScorers} />
            </div>
          </SectionHeading>
        </section>
      </PageHeading>
    </div>
  );
}

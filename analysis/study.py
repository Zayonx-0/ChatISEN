"""A01-A03 reproducible quality study scaffold; consumes CSV exports when available."""
from pathlib import Path
import csv, json, statistics
root=Path(__file__).parent
src=root/'data.csv'; out=root/'study-result.json'
if not src.exists():
    result={'status':'blocked','reason':'getStats export absent; collect 30 independent calls first','seed':42}
else:
    rows=list(csv.DictReader(src.open())); losses=[float(r.get('packets_lost',0))/(float(r.get('packets_lost',0))+float(r.get('packets_received',0)) or 1) for r in rows]
    result={'status':'measured','windows':len(rows),'loss_mean':statistics.mean(losses) if losses else None,'seed':42}
out.write_text(json.dumps(result,indent=2));print(json.dumps(result,indent=2))

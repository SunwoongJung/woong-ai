"""격리 fresh-seed 평가 실행기 — 라이브 DB/서버와 분리해 재현 가능한 평가를 보장한다.

사용: python -m eval.run   (임시 DB에 fresh seed 생성 → 하네스 전체 실행 → 임시 DB 정리)

라이브 wms.db를 절대 건드리지 않도록 DB_PATH를 임시 파일로 강제한 뒤(=config 싱글톤이 반영),
seed.generate로 원본 시드를 재현하고 harness.main()을 돌린다. 도메인 골든값(L-A-001 등)은
원본 시드 기준이므로 이 fresh-seed 위에서만 유효하다.
"""
import os
import pathlib
import tempfile

# 프로젝트 모듈 import 이전에 DB 경로를 임시 파일로 고정(config가 DB_PATH env를 읽음)
_TMP = pathlib.Path(tempfile.gettempdir()) / f"wms_eval_{os.getpid()}.db"
os.environ["DB_PATH"] = str(_TMP)

from eval import harness          # noqa: E402
from seed.generate import generate  # noqa: E402


def main() -> None:
    print(f"[격리 평가] DB={_TMP}")
    try:
        counts = generate(reset=True)   # 원본 시드 재현(random.seed 고정)
        print(f"[fresh seed] inventory={counts.get('inventory')} · outbound={counts.get('outbound')} · "
              f"inbound={counts.get('inbound')} · locations={counts.get('locations')}")
        harness.main()
    finally:
        for suffix in ("", "-wal", "-shm"):
            p = pathlib.Path(str(_TMP) + suffix)
            if p.exists():
                try:
                    p.unlink()
                except OSError:
                    pass
        print("[격리 평가] 임시 DB 정리 완료")


if __name__ == "__main__":
    main()

from fastapi import FastAPI
from pydantic import BaseModel
from presidio_analyzer import AnalyzerEngine
from presidio_anonymizer import AnonymizerEngine
from presidio_anonymizer.entities import OperatorConfig, RecognizerResult


app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)
analyzer = AnalyzerEngine()
anonymizer = AnonymizerEngine()


class AnalyzeRequest(BaseModel):
    text: str
    language: str = "en"
    return_decision_process: bool = False


class DetectionRequest(BaseModel):
    entity_type: str
    start: int
    end: int
    score: float


class OperatorRequest(BaseModel):
    type: str


class AnonymizeRequest(BaseModel):
    text: str
    analyzer_results: list[DetectionRequest]
    anonymizers: dict[str, OperatorRequest]


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ready"}


@app.post("/analyze")
def analyze(request: AnalyzeRequest) -> list[dict[str, str | int | float]]:
    results = analyzer.analyze(
        text=request.text,
        language=request.language,
        return_decision_process=request.return_decision_process,
    )

    return [
        {
            "entity_type": result.entity_type,
            "start": result.start,
            "end": result.end,
            "score": result.score,
        }
        for result in results
    ]


@app.post("/anonymize")
def anonymize(request: AnonymizeRequest) -> dict[str, str]:
    analyzer_results = [
        RecognizerResult(
            entity_type=result.entity_type,
            start=result.start,
            end=result.end,
            score=result.score,
        )
        for result in request.analyzer_results
    ]
    operators = {
        name: OperatorConfig(operator.type) for name, operator in request.anonymizers.items()
    }
    result = anonymizer.anonymize(
        text=request.text,
        analyzer_results=analyzer_results,
        operators=operators,
    )

    return {"text": result.text}

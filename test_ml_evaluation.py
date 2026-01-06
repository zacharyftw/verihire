"""
Standalone ML Evaluation Test Script
Tests CodeBERT and BERT services without requiring full infrastructure
"""

import sys
import json
import time
from pathlib import Path

# Add apps/ml to path
ml_path = Path(__file__).parent / "apps" / "ml"
sys.path.insert(0, str(ml_path))

from app.services.codebert_service import CodeBERTService
from app.services.bert_service import BERTService
from app.schemas import (
    CodeEvaluationRequest,
    TextEvaluationRequest,
    ProgrammingLanguage,
    TextEvaluationType,
)


def print_header(text):
    """Print a formatted header"""
    print("\n" + "=" * 80)
    print(f"  {text}")
    print("=" * 80 + "\n")


def print_section(text):
    """Print a formatted section"""
    print(f"\n--- {text} ---")


def test_code_evaluation():
    """Test code evaluation with sample code submissions"""
    
    print_header("CODE EVALUATION TEST - CodeBERT Model")
    
    # Initialize service
    print("Initializing CodeBERT service...")
    start_time = time.time()
    service = CodeBERTService()
    service.load_model()
    load_time = (time.time() - start_time) * 1000
    print(f"[OK] Model loaded successfully on {service.device}")
    print(f"[OK] Load time: {load_time:.2f}ms\n")
    
    # Test cases with different quality levels
    test_cases = [
        {
            "name": "High Quality Python - Fibonacci with Docs",
            "code": '''def fibonacci(n: int) -> int:
    """
    Calculate the nth Fibonacci number using dynamic programming.
    
    Args:
        n: Position in Fibonacci sequence (0-indexed)
        
    Returns:
        The nth Fibonacci number
        
    Time Complexity: O(n)
    Space Complexity: O(1)
    """
    if n < 0:
        raise ValueError("n must be non-negative")
    
    if n <= 1:
        return n
    
    # Use iterative approach for efficiency
    prev, curr = 0, 1
    for _ in range(2, n + 1):
        prev, curr = curr, prev + curr
    
    return curr
''',
            "language": ProgrammingLanguage.PYTHON,
        },
        {
            "name": "Medium Quality JavaScript - Quick Sort",
            "code": '''function quickSort(arr) {
    if (arr.length <= 1) return arr;
    
    const pivot = arr[Math.floor(arr.length / 2)];
    const left = arr.filter(x => x < pivot);
    const middle = arr.filter(x => x === pivot);
    const right = arr.filter(x => x > pivot);
    
    return [...quickSort(left), ...middle, ...quickSort(right)];
}

console.log(quickSort([3,6,8,10,1,2,1]));
''',
            "language": ProgrammingLanguage.JAVASCRIPT,
        },
        {
            "name": "Low Quality Python - Security Issues",
            "code": '''password="admin123"
api_key = "sk-1234567890abcdef"

def process(user_input):
    result = eval(user_input)
    return result

x=process("2+2")
print(x)
''',
            "language": ProgrammingLanguage.PYTHON,
        },
    ]
    
    results = []
    
    for i, test_case in enumerate(test_cases, 1):
        print_section(f"Test {i}/{len(test_cases)}: {test_case['name']}")
        
        # Create request
        request = CodeEvaluationRequest(
            code=test_case["code"],
            language=test_case["language"],
        )
        
        # Evaluate
        response = service.evaluate(request)
        
        # Display results
        print(f"\nEvaluation Results:")
        print(f"  Overall Score:        {response.overall_score:.1f}/100")
        print(f"  Complexity Score:     {response.metrics.complexity_score * 100:.1f}/100")
        print(f"  Readability Score:    {response.metrics.readability_score * 100:.1f}/100")
        print(f"  Maintainability:      {response.metrics.maintainability_score * 100:.1f}/100")
        print(f"  Security Score:       {response.metrics.security_score * 100:.1f}/100")
        print(f"  Best Practices:       {response.metrics.best_practices_score * 100:.1f}/100")
        print(f"  Processing Time:      {response.processing_time_ms:.2f}ms")
        print(f"  Issues Found:         {len(response.issues)}")
        
        if response.issues:
            print(f"\nIssues:")
            for issue in response.issues[:5]:
                print(f"  [{issue.severity.upper()}] {issue.message}")
        
        if response.suggestions:
            print(f"\nSuggestions:")
            for suggestion in response.suggestions[:3]:
                print(f"  - {suggestion}")
        
        print()
        
        # Store result
        results.append({
            "name": test_case["name"],
            "score": response.overall_score,
            "metrics": {
                "complexity": response.metrics.complexity_score * 100,
                "readability": response.metrics.readability_score * 100,
                "maintainability": response.metrics.maintainability_score * 100,
                "security": response.metrics.security_score * 100,
                "best_practices": response.metrics.best_practices_score * 100,
            },
            "processing_time_ms": response.processing_time_ms,
            "issues_count": len(response.issues),
        })
    
    return results


def test_text_evaluation():
    """Test text evaluation with sample written responses"""
    
    print_header("TEXT EVALUATION TEST - BERT Model")
    
    # Initialize service
    print("Initializing BERT service...")
    start_time = time.time()
    service = BERTService()
    service.load_model()
    load_time = (time.time() - start_time) * 1000
    print(f"[OK] Model loaded successfully on {service.device}")
    print(f"[OK] Load time: {load_time:.2f}ms\n")
    
    # Test cases
    test_cases = [
        {
            "name": "High Quality Technical Explanation",
            "text": '''The Model-View-Controller (MVC) pattern is a fundamental software design pattern that separates an application into three interconnected components, promoting modular development and maintainability.

The Model component represents the data layer and business logic. It encapsulates the application's data structure, validation rules, and business operations. The Model is independent of the user interface and handles data persistence, retrieval, and manipulation.

The View component handles the presentation layer, responsible for rendering the user interface and displaying data to users. It receives data from the Model and presents it in a user-friendly format.

The Controller acts as an intermediary between Model and View, processing user input and updating both components accordingly. It receives user actions from the View, interprets them, calls appropriate Model methods to process the data, and updates the View with results.

The primary benefits of MVC include improved code organization, easier testing through component isolation, support for multiple simultaneous Views of the same data, and simplified maintenance.''',
        },
        {
            "name": "Medium Quality Response",
            "text": '''MVC is a design pattern used in software development. It has three parts: Model, View, and Controller.

The Model is the data part. It stores information and handles database operations. The View is what the user sees on screen. It displays the data to users. The Controller connects them together and handles user actions.

MVC is good because it separates concerns and makes code more organized.''',
        },
    ]
    
    results = []
    
    for i, test_case in enumerate(test_cases, 1):
        print_section(f"Test {i}/{len(test_cases)}: {test_case['name']}")
        
        # Create request
        request = TextEvaluationRequest(
            text=test_case["text"],
            evaluation_type=TextEvaluationType.WRITTEN_RESPONSE,
        )
        
        # Evaluate
        response = service.evaluate(request)
        
        # Display results
        print(f"\nEvaluation Results:")
        print(f"  Overall Score:        {response.overall_score:.1f}/100")
        print(f"  Relevance Score:      {response.metrics.relevance_score * 100:.1f}/100")
        print(f"  Clarity Score:        {response.metrics.clarity_score * 100:.1f}/100")
        print(f"  Coherence Score:      {response.metrics.coherence_score * 100:.1f}/100")
        print(f"  Depth Score:          {response.metrics.depth_score * 100:.1f}/100")
        print(f"  Originality Score:    {response.metrics.originality_score * 100:.1f}/100")
        print(f"  Processing Time:      {response.processing_time_ms:.2f}ms")
        print(f"  Word Count:           {response.word_count}")
        
        if response.topics_covered:
            print(f"\nTopics Covered: {', '.join(response.topics_covered)}")
        
        if response.suggestions:
            print(f"\nSuggestions:")
            for suggestion in response.suggestions[:3]:
                print(f"  - {suggestion}")
        
        print()
        
        # Store result
        results.append({
            "name": test_case["name"],
            "score": response.overall_score,
            "metrics": {
                "relevance": response.metrics.relevance_score * 100,
                "clarity": response.metrics.clarity_score * 100,
                "coherence": response.metrics.coherence_score * 100,
                "depth": response.metrics.depth_score * 100,
                "originality": response.metrics.originality_score * 100,
            },
            "processing_time_ms": response.processing_time_ms,
            "word_count": response.word_count,
        })
    
    return results


def generate_summary(code_results, text_results):
    """Generate summary statistics"""
    
    print_header("SUMMARY STATISTICS - FOR PRESENTATION")
    
    all_results = code_results + text_results
    
    # Overall statistics
    print_section("Overall Statistics")
    print(f"Total Evaluations: {len(all_results)}")
    print(f"Code Evaluations: {len(code_results)}")
    print(f"Text Evaluations: {len(text_results)}")
    
    avg_score = sum(r["score"] for r in all_results) / len(all_results)
    avg_time = sum(r["processing_time_ms"] for r in all_results) / len(all_results)
    
    print(f"Average Score: {avg_score:.2f}/100")
    print(f"Average Processing Time: {avg_time:.2f}ms")
    
    # Pass rate (>=70)
    passing = sum(1 for r in all_results if r["score"] >= 70)
    pass_rate = (passing / len(all_results)) * 100
    print(f"Pass Rate (>=70): {pass_rate:.1f}% ({passing}/{len(all_results)})")
    
    # Score distribution
    print_section("Score Distribution")
    ranges = [
        ("Excellent (90-100)", 90, 100),
        ("Good (80-89)", 80, 89),
        ("Satisfactory (70-79)", 70, 79),
        ("Needs Improvement (60-69)", 60, 69),
        ("Poor (0-59)", 0, 59),
    ]
    
    for label, min_score, max_score in ranges:
        count = sum(1 for r in all_results if min_score <= r["score"] <= max_score)
        percentage = (count / len(all_results)) * 100
        print(f"{label:30s} {count:2d} ({percentage:5.1f}%)")
    
    # Code evaluation metrics
    if code_results:
        print_section("Code Evaluation - Average Metrics")
        metrics = ["complexity", "readability", "maintainability", "security", "best_practices"]
        for metric in metrics:
            avg = sum(r["metrics"][metric] for r in code_results) / len(code_results)
            print(f"  {metric.replace('_', ' ').title():25s} {avg:.1f}/100")
    
    # Text evaluation metrics
    if text_results:
        print_section("Text Evaluation - Average Metrics")
        metrics = ["relevance", "clarity", "coherence", "depth", "originality"]
        for metric in metrics:
            avg = sum(r["metrics"][metric] for r in text_results) / len(text_results)
            print(f"  {metric.title():25s} {avg:.1f}/100")
    
    # Save results to JSON
    output_file = "evaluation_results.json"
    with open(output_file, "w") as f:
        json.dump({
            "summary": {
                "total_evaluations": len(all_results),
                "code_evaluations": len(code_results),
                "text_evaluations": len(text_results),
                "average_score": round(avg_score, 2),
                "pass_rate": round(pass_rate, 1),
                "average_processing_time_ms": round(avg_time, 2),
            },
            "code_results": code_results,
            "text_results": text_results,
        }, f, indent=2)
    
    print(f"\n[OK] Detailed results saved to: {output_file}\n")
    
    # Print presentation metrics
    print_header("KEY METRICS FOR YOUR PRESENTATION")
    print(f"""
Evaluation System Performance:
  * Total Evaluations Completed: {len(all_results)}
  * Average Score: {avg_score:.1f}/100
  * Pass Rate: {pass_rate:.1f}%
  * Average Processing Time: {avg_time:.2f}ms
  * Languages Supported: Python, JavaScript, TypeScript, Java, C++, Go, Rust
   
Quality Metrics:
  * Multi-dimensional analysis: 5 metrics per evaluation
  * Automated security vulnerability detection
  * Code complexity analysis
  * Best practices validation
   
Technical Capabilities:
  * CodeBERT Model: 125M parameters (Microsoft)
  * BERT Model: 110M parameters  
  * Real-time evaluation
  * Detailed feedback generation
  * Issue categorization and suggestions
    """)


def main():
    """Main test execution"""
    print_header("VeriHire AI/ML Evaluation System - E2E Test")
    print("Testing CodeBERT and BERT models with sample submissions\n")
    
    try:
        # Test code evaluation
        code_results = test_code_evaluation()
        
        # Test text evaluation
        text_results = test_text_evaluation()
        
        # Generate summary
        generate_summary(code_results, text_results)
        
        print_header("[SUCCESS] ALL TESTS COMPLETED")
        print("\nYou can now use these results in your presentation!")
        print("The evaluation_results.json file contains all detailed metrics.\n")
        
    except Exception as e:
        print(f"\n[ERROR] {e}")
        import traceback
        traceback.print_exc()
        return 1
    
    return 0


if __name__ == "__main__":
    sys.exit(main())

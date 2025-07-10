using System;
using System.Collections.Generic;
using System.Threading.Tasks;

namespace TestComplexNamespace
{
    public class ComplexTestClass
    {
        public void StartProcess()
        {
            ValidateInputs();
            ProcessData();
            GenerateOutput();
        }

        public void ValidateInputs()
        {
            CheckMandatoryFields();
            ValidateBusinessRules();
        }

        public void CheckMandatoryFields()
        {
            // Check required fields
            Console.WriteLine("Checking mandatory fields");
        }

        public void ValidateBusinessRules()
        {
            CheckDateRange();
            ValidateAmounts();
        }

        public void CheckDateRange()
        {
            Console.WriteLine("Validating date range");
        }

        public void ValidateAmounts()
        {
            Console.WriteLine("Validating amounts");
        }

        public void ProcessData()
        {
            LoadData();
            TransformData();
            ValidateResults();
        }

        public void LoadData()
        {
            Console.WriteLine("Loading data");
        }

        public void TransformData()
        {
            ApplyBusinessLogic();
            CalculateValues();
        }

        public void ApplyBusinessLogic()
        {
            Console.WriteLine("Applying business logic");
        }

        public void CalculateValues()
        {
            PerformCalculations();
        }

        public void PerformCalculations()
        {
            Console.WriteLine("Performing calculations");
        }

        public void ValidateResults()
        {
            CheckDataIntegrity();
        }

        public void CheckDataIntegrity()
        {
            Console.WriteLine("Checking data integrity");
        }

        public void GenerateOutput()
        {
            FormatOutput();
            SaveResults();
        }

        public void FormatOutput()
        {
            Console.WriteLine("Formatting output");
        }

        public void SaveResults()
        {
            ValidateBeforeSave();
            WriteToFile();
        }

        public void ValidateBeforeSave()
        {
            Console.WriteLine("Final validation before save");
        }

        public void WriteToFile()
        {
            Console.WriteLine("Writing to file");
        }
    }

    public class HelperClass
    {
        public void HelperMethod()
        {
            Console.WriteLine("Helper method called");
        }
    }
}

using System;

public class SampleClass 
{
    public void SimpleMethod()
    {
        Console.WriteLine("Simple method");
    }
    
    public void CallerMethod()
    {
        SimpleMethod();
        Console.WriteLine("Caller method");
    }
    
    public void DirectRecursion(int count)
    {
        if (count > 0)
        {
            DirectRecursion(count - 1);
        }
    }
    
    public void IndirectA()
    {
        IndirectB();
    }
    
    public void IndirectB()
    {
        IndirectA();
    }
}

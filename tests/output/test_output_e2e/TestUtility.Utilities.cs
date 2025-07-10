using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using System.Data;
using Microsoft.Extensions.Logging;

namespace TestNamespace.Refactored
{
    public partial class TestUtility
    {


        //#endregion

        //#region Utility Methods

        public static string FormatString(string input, params object[] args)
        {
            return string.Format(input, args);
        }



        public T ConvertData<T>(object data) where T : class
        {
            try
            {
                return data as T;
            }
            catch (Exception ex)
            {
                throw new InvalidOperationException($"Cannot convert data to {typeof(T).Name}", ex);
            }
        }



        public void SendNotification(string message, string recipient)
        {
            _logger.LogInformation($"Sending notification to {recipient}: {message}");
            // Notification logic here
        }

    }
}
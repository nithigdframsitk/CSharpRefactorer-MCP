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

        //#region Configuration Methods

        public string GetConfigValue(string key)
        {
            // Configuration retrieval logic
            return $"Value for {key}";
        }



        public void SetConfigValue(string key, string value)
        {
            // Configuration setting logic
            _logger.LogInformation($"Setting config {key} = {value}");
        }



        public async Task<Dictionary<string, string>> GetAllConfigAsync()
        {
            await Task.Delay(50);
            return new Dictionary<string, string>
            {
                { "setting1", "value1" },
                { "setting2", "value2" }
            };
        }

    }
}
using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using System.Data;
using Microsoft.Extensions.Logging;

namespace TestNamespace.Refactored
{
    public partial class TestUtility
    {
        private readonly ILogger<TestUtility> _logger;
        private readonly string _connectionString;

        public TestUtility(ILogger<TestUtility> logger, string connectionString)
        {
            _logger = logger;
            _connectionString = connectionString;
        }

        private void LogError(Exception ex, string message)
        {
            _logger.LogError(ex, message);
        }

        #endregion
    }

    public partial class User
    {
        public int Id { get; set; }
        public string Name { get; set; }
        public string Email { get; set; }
        public DateTime CreatedDate { get; set; }
    }
}

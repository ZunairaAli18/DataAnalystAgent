# Column Analysis Feature - Testing Guide

## Pre-Testing Checklist

- [ ] Backend running on http://localhost:8000
- [ ] Frontend running on http://localhost:3000
- [ ] Browser developer console is open
- [ ] Sample CSV/Excel file ready
- [ ] Database/Storage connection working

## Test Cases

### Test 1: Backend API Availability

**Objective**: Verify backend API is running

**Steps**:
1. Open browser and go to: `http://localhost:8000/docs`
2. Look for Swagger API documentation
3. Search for `/data/{dataset_id}/column/{column_name}/analysis`

**Expected Result**:
- ✓ API documentation page loads
- ✓ New endpoints visible in list
- ✓ Endpoint shows correct request/response format

**If Failed**:
- Check backend is running: `python -m uvicorn main:app --reload`
- Verify port 8000 is available
- Check for import errors in terminal

---

### Test 2: Frontend Navigation

**Objective**: Verify UI elements are in place

**Steps**:
1. Open http://localhost:3000
2. Check sidebar navigation
3. Look for "Column Analysis" menu item

**Expected Result**:
- ✓ Sidebar visible with all navigation items
- ✓ "Column Analysis" appears between "Cleaned Data" and "Dashboard"
- ✓ Icon shows correctly (trending up icon)

**If Failed**:
- Force refresh: Ctrl+Shift+R (Windows) or Cmd+Shift+R (Mac)
- Clear browser cache
- Restart frontend: Ctrl+C and `npm run dev`

---

### Test 3: Data Ingestion Flow

**Objective**: Test complete workflow from upload to analysis

**Steps**:
1. Go to "Ingestion" page
2. Upload sample CSV file with:
   - Numeric column (e.g., "Sales" with values)
   - Categorical column (e.g., "Category")
   - String column (e.g., "Name")
3. Wait for file to process (should show "ready")
4. Go to "View Data" page
5. Verify data loads

**Expected Result**:
- ✓ File uploaded successfully
- ✓ Status shows "ready"
- ✓ Data displays in table

**Sample Test Data (CSV format)**:
```csv
Name,Sales,Category,Date
Product A,1500,Electronics,2024-01-01
Product B,2300,Electronics,2024-01-02
Product C,500,Clothing,2024-01-03
Product D,4200,Electronics,2024-01-04
Product E,800,Clothing,2024-01-05
```

---

### Test 4: Data Cleaning

**Objective**: Test data cleaning and storage in localStorage

**Steps**:
1. From "View Data", apply some cleaning operations
2. Click any cleaning option (e.g., "Handle missing values")
3. Complete the cleaning process
4. Verify cleaned data appears

**Expected Result**:
- ✓ Cleaned data displays in table
- ✓ Summary shows rows removed/updated
- ✓ "Column Analysis" button is visible

**If Failed**:
- Check browser console for errors (F12)
- Verify localStorage is enabled
- Try different cleaning operation

---

### Test 5: Navigate to Column Analysis

**Objective**: Test navigation to analysis page

**Steps**:
1. From "Cleaned Data" page
2. Click "Column Analysis" button (cyan button)
3. Wait for page to load

**Expected Result**:
- ✓ Page redirects to `/column-analysis?dataset_id=...`
- ✓ Page loads with column list
- ✓ First column selected by default
- ✓ Navigation buttons visible

**If Failed**:
- Check URL has dataset_id parameter
- Verify localStorage contains cleaned data
- Check browser console for errors

---

### Test 6: Column Selection

**Objective**: Test column navigation

**Steps**:
1. On column analysis page
2. Click "Next" button to navigate columns
3. Click column name tabs at top
4. Use "Previous" button

**Expected Result**:
- ✓ Previous button disabled on first column
- ✓ Next button disabled on last column
- ✓ Column tabs update highlight
- ✓ Column name displays in navigator card

**If Failed**:
- Verify columns loaded from localStorage
- Check browser console
- Refresh page and try again

---

### Test 7: Analysis Loading

**Objective**: Test backend API call and data loading

**Steps**:
1. Select a numeric column (e.g., "Sales")
2. Wait for spinner to finish
3. Check for results

**Expected Result**:
- ✓ Loading spinner appears for 1-3 seconds
- ✓ Analysis results display
- ✓ No error messages
- ✓ Graph renders

**If Failed**:
- Check browser Network tab (F12)
- Look for API response status code
- Verify backend is running
- Check CORS errors in console

---

### Test 8: Numeric Column Analysis

**Objective**: Test analysis of numeric columns

**Steps**:
1. Select numeric column (e.g., "Sales")
2. Wait for analysis to load
3. Review displayed information

**Expected Result**:
- ✓ Data type shows "numeric"
- ✓ Histogram graph displays distribution
- ✓ Statistics cards show:
  - Total Values
  - Missing %
  - Unique Values
  - Mean
  - Min
  - Max
- ✓ Insights section shows findings
- ✓ Recommendations section shows advice

**Statistics Should Show**:
- Total count matches data
- Null percentage ≥ 0
- Mean value in range
- Min < Max

---

### Test 9: Categorical Column Analysis

**Objective**: Test analysis of categorical columns

**Steps**:
1. Select categorical column (e.g., "Category")
2. Wait for analysis to load
3. Review results

**Expected Result**:
- ✓ Data type shows "categorical"
- ✓ Bar chart displays top values
- ✓ Statistics cards show value counts
- ✓ Insights about cardinality

**Bar Chart Should Show**:
- Category names on X-axis
- Counts on Y-axis
- Correct heights for each bar

---

### Test 10: Analysis Insights

**Objective**: Test insight generation

**Steps**:
1. Review "Key Insights" section
2. Note any warnings or findings
3. Check multiple columns

**Expected Result**:
- ✓ At least one insight per column
- ✓ Insights are readable and relevant
- ✓ Icons display correctly (check marks, warning signs)

**Examples of Expected Insights**:
- "Column appears to be in good condition"
- "Contains X% missing values"
- "Right-skewed distribution detected"
- "Very high cardinality"

---

### Test 11: Recommendations

**Objective**: Test recommendation generation

**Steps**:
1. Review "Recommendations" section
2. Read suggestions
3. Check if they're actionable

**Expected Result**:
- ✓ Recommendations are specific to column type
- ✓ Suggestions are actionable
- ✓ Numbered list format
- ✓ Icons display correctly

**Examples of Expected Recommendations**:
- "Consider imputing missing values"
- "Apply log transformation"
- "Column is well-suited for analysis"

---

### Test 12: Error Handling

**Objective**: Test error scenarios

**Test Case A: Invalid Column**
1. Manually edit URL to non-existent column
2. Observe error handling

Expected: Shows error alert

**Test Case B: Invalid Dataset**
1. Manually edit dataset_id in URL
2. Observe error handling

Expected: Shows error alert

**Test Case C: Backend Down**
1. Stop backend server
2. Try to load analysis
3. Observe error handling

Expected: Shows loading timeout or connection error

---

### Test 13: Responsive Design

**Objective**: Test mobile/tablet responsiveness

**Steps**:
1. Open browser DevTools (F12)
2. Click responsive design mode (Ctrl+Shift+M)
3. Test different screen sizes:
   - 320px (mobile)
   - 768px (tablet)
   - 1024px (desktop)
4. Navigate columns and view graphs

**Expected Result**:
- ✓ Layout adapts to screen size
- ✓ Buttons remain clickable
- ✓ Graph still renders on mobile
- ✓ No content overflow
- ✓ Text readable at all sizes

---

### Test 14: Performance

**Objective**: Test performance with different data sizes

**Test Cases**:

**Small Dataset (1K rows)**
1. Upload 1000-row CSV
2. Measure analysis load time
3. Should load in <1 second

**Medium Dataset (10K rows)**
1. Upload 10,000-row CSV
2. Measure analysis load time
3. Should load in <2 seconds

**Large Dataset (100K rows)**
1. Upload 100,000-row CSV
2. Measure analysis load time
3. Should load in <5 seconds

**Monitor**:
- API response time (Network tab)
- Graph rendering time
- Memory usage

---

### Test 15: Browser Compatibility

**Test on**:
- [ ] Chrome/Chromium
- [ ] Firefox
- [ ] Safari
- [ ] Edge
- [ ] Mobile Safari (iOS)
- [ ] Chrome Mobile

**Check**:
- ✓ Page loads
- ✓ Navigation works
- ✓ Graphs render
- ✓ No console errors

---

## Edge Cases to Test

### Test 16: All Null Column
**Setup**: Create column with all NULL values
**Expected**: Shows 100% missing, no statistics

### Test 17: Single Value Column
**Setup**: Create column with all same values
**Expected**: Shows warning about no variance

### Test 18: Mixed Type Column
**Setup**: Column with numbers and text mixed
**Expected**: Detected as categorical/mixed

### Test 19: Very Long Column Names
**Setup**: Column name > 50 characters
**Expected**: Name truncated with ellipsis

### Test 20: Special Characters in Names
**Setup**: Column name with spaces, symbols: "Sales@2024"
**Expected**: Handled correctly without errors

---

## Test Results Template

```
Test Date: ___________
Tester: ___________
Browser: Chrome ___  Firefox ___  Safari ___  Other: _____
OS: Windows ___  Mac ___  Linux ___

Test Case                    Status      Notes
─────────────────────────────────────────────────────
1. API Availability          ☐ Pass
2. Frontend Navigation       ☐ Pass
3. Data Ingestion           ☐ Pass
4. Data Cleaning            ☐ Pass
5. Navigate to Analysis     ☐ Pass
6. Column Selection         ☐ Pass
7. Analysis Loading         ☐ Pass
8. Numeric Analysis         ☐ Pass
9. Categorical Analysis     ☐ Pass
10. Insights               ☐ Pass
11. Recommendations        ☐ Pass
12. Error Handling         ☐ Pass
13. Responsive Design      ☐ Pass
14. Performance            ☐ Pass
15. Browser Compatibility  ☐ Pass
16. Null Column            ☐ Pass
17. Single Value Column    ☐ Pass
18. Mixed Type Column      ☐ Pass
19. Long Column Names      ☐ Pass
20. Special Characters     ☐ Pass

Overall Result: _____ PASS / _____ FAIL

Issues Found:
1. _______________
2. _______________
3. _______________

Comments:
_________________________
```

---

## Performance Benchmarks

Expected timings:
| Operation | Expected Time | Notes |
|-----------|---------------|-------|
| Page load | <500ms | Initial render |
| Column select | <100ms | Switch column |
| API call | 1-3s | Analyze column |
| Graph render | <200ms | Recharts rendering |
| Full workflow | 5-10s | Ingest to analysis |

---

## Debugging Tips

### Check Backend Logs
```bash
# Terminal running backend
# Look for:
# - "GET /data/{dataset_id}/column/..." requests
# - Response times
# - Any error messages
```

### Check Frontend Logs
```javascript
// Open DevTools Console (F12)
// Look for:
// - fetch() errors
// - Component rendering errors
// - State changes
```

### Check Network Traffic
```
DevTools → Network Tab
- Filter by "XHR"
- Look for API calls to backend
- Check response status codes
- Verify response time
- Examine payload size
```

### Enable Debug Mode
```javascript
// Add to column-analysis.tsx
console.log("[v0] Analysis loaded:", analysis)
console.log("[v0] Graph data:", analysis.graph_data)
console.log("[v0] Statistics:", analysis.statistics)
```

---

## Sign-Off Checklist

- [ ] All 15 core tests passed
- [ ] All edge cases tested
- [ ] Performance acceptable
- [ ] No console errors
- [ ] Responsive on mobile
- [ ] Works on target browsers
- [ ] Documentation complete
- [ ] Ready for production

---

## Support

If tests fail:
1. Check COLUMN_ANALYSIS_QUICKSTART.md for quick fixes
2. Review COLUMN_ANALYSIS_SETUP.md for configuration
3. Check browser console for detailed errors
4. Verify backend is running and accessible

**Happy Testing!** ✓

import time
from selenium import webdriver
from selenium.webdriver.common.by import By

options = webdriver.ChromeOptions()
options.add_argument("--user-agent=HackSirCrawler/3.0")
options.add_argument("--disable-blink-features=AutomationControlled")

driver = webdriver.Chrome(options=options)
driver.get("https://胡言.tw/lab3")
driver.add_cookie({"name": "hacksir_pass", "value": "owo_lab3"})
driver.refresh()

time.sleep(1000)
# print(driver.find_element(By.ID, "result").text)
# HackSir{n0t_a_r0b0t_1_sw3ar}
